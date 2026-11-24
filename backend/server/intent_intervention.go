package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/db"
)

const maxWorkerMessageBytes = 64 << 10

func validWorkerMessageRequestID(id string) bool {
	if id == "" || len(id) > 128 {
		return false
	}
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' || r == ':' {
			continue
		}
		return false
	}
	return true
}

// sendWorkerMessage continues a paused Worker intent with a human-authored message.
// The message is injected as the next turn's input through the same
// resume-from-transcript path the worker uses on a normal resume (ExecuteWithMessage),
// so this reuses the existing pause/resume machinery rather than a bespoke protocol.
// The run happens in a dedicated goroutine outside the worker pool (runDetachedIntent),
// so the message is picked up immediately even when every pool slot is busy — the same
// way the main-agent chat handler starts its run directly. In-memory only: a process
// restart re-runs the intent from its transcript without the message, which is
// acceptable for this rare interrupt-then-continue action.
func (s *Server) sendWorkerMessage(w http.ResponseWriter, r *http.Request) {
	t, ok := s.m.Task(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "task not found")
		return
	}
	iid, err := strconv.ParseInt(r.PathValue("iid"), 10, 64)
	if err != nil || iid <= 0 {
		writeErr(w, http.StatusBadRequest, "bad intent id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxWorkerMessageBytes)
	var req struct {
		Message   string `json:"message"`
		RequestID string `json:"request_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, http.StatusRequestEntityTooLarge, "请求体过大")
			return
		}
		writeErr(w, http.StatusBadRequest, "bad json: "+err.Error())
		return
	}
	message := strings.TrimSpace(req.Message)
	requestID := strings.TrimSpace(req.RequestID)
	if message == "" {
		writeErr(w, http.StatusBadRequest, "消息不能为空")
		return
	}
	if len([]rune(message)) > 4000 {
		writeErr(w, http.StatusBadRequest, "消息不能超过 4000 个字符")
		return
	}
	if !validWorkerMessageRequestID(requestID) {
		writeErr(w, http.StatusBadRequest, "request_id 必须是 1-128 位字母、数字、-、_、. 或 :")
		return
	}

	// Reject non-runnable task lifecycles up front so the caller gets a clear reason
	// instead of a silent no-op. The intent itself must be paused: the UI flow is
	// interrupt (pause) first, then send.
	if s.engine.IsDeleting(t.ID) {
		writeErr(w, http.StatusConflict, "任务正在删除，无法向 Worker 发送消息")
		return
	}
	lifecycle := t.lifecycleSnapshot()
	switch {
	case lifecycle.Paused || s.engine.IsPaused(t.ID):
		writeErr(w, http.StatusConflict, "任务已暂停，请先恢复任务再向 Worker 发送消息")
		return
	case lifecycle.Queued:
		writeErr(w, http.StatusConflict, "排队中的任务无法向 Worker 发送消息")
		return
	case isTerminalStatus(lifecycle.Status):
		writeErr(w, http.StatusConflict, "终态任务无法向 Worker 发送消息")
		return
	case s.engine.isSettling(t.ID):
		writeErr(w, http.StatusConflict, "任务正在收尾，无法向 Worker 发送消息")
		return
	}

	node, err := t.Store.GetNode(iid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if node == nil {
		if inherited, sourceErr := t.Store.GetNodeWithSources(iid); sourceErr == nil && inherited != nil && inherited.Inherited {
			writeErr(w, http.StatusConflict, "继承意图为只读，不能发送 Worker 消息")
			return
		}
		writeErr(w, http.StatusNotFound, "intent not found")
		return
	}
	if node.Kind != db.KindIntent {
		writeErr(w, http.StatusConflict, "node is not an intent")
		return
	}
	if node.State != "paused" {
		writeErr(w, http.StatusConflict, "仅已暂停的 Worker 可以发送消息，请先暂停")
		return
	}
	agentMessage, ok := s.prepareChatMentionMessage(w, message)
	if !ok {
		return
	}

	// runDetachedIntent transitions paused->running, emits the user turn and starts a
	// dedicated run. Root the run at s.ctx so a disconnected browser cannot strand it
	// while task pause/delete/shutdown still stop it.
	if err := s.engine.runDetachedIntent(s.ctx, t, iid, requestID, message, agentMessage); err != nil {
		switch {
		case errors.Is(err, db.ErrIntentStateConflict):
			writeErr(w, http.StatusConflict, err.Error())
		default:
			writeErr(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         iid,
		"state":      "running",
		"accepted":   true,
		"request_id": requestID,
	})
}

// ---- 实时纠偏（任务级、不打断）--------------------------------------------------
//
// 与上面的 sendWorkerMessage 的区别：
//   - sendWorkerMessage 是"打断式"：意图必须先暂停，消息作为新的一轮输入重启它，
//     代价是丢掉当前这一轮的推理与在途工具调用；
//   - 这里的 taskSteer 是"不打断式"：消息排进引擎的 steerBox，worker 在下一次
//     工具调用前取走它——那次调用被拦下、消息交给模型，模型据此重新规划。
//     任务不停、意图不重启，最接近"结对干活时人在旁边说一句"。
//
// 操作员面对的是任务而不是意图 id，所以默认广播到该任务当前所有在跑的意图；
// 想精确打到某条意图时传 intent_id。

// taskSteerStatus 报告现在能不能插话：哪些意图在跑、各有多少条消息还没被取走。
func (s *Server) taskSteerStatus(w http.ResponseWriter, r *http.Request) {
	t, ok := s.m.Task(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "task not found")
		return
	}
	ids := s.engine.RunningIntentsForTask(t.ID)
	running := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		running = append(running, map[string]any{
			"intent_id": id,
			"pending":   s.engine.PendingSteers(id),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"running": running,
		"steerable": len(running) > 0,
	})
}

// taskSteer 把操作员的一句话排进正在跑的意图，worker 下一步工具调用前生效。
func (s *Server) taskSteer(w http.ResponseWriter, r *http.Request) {
	t, ok := s.m.Task(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "task not found")
		return
	}
	if s.engine.IsDeleting(t.ID) {
		writeErr(w, http.StatusConflict, "任务正在删除，无法插话")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxWorkerMessageBytes)
	var req struct {
		Message  string `json:"message"`
		IntentID int64  `json:"intent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, http.StatusRequestEntityTooLarge, "请求体过大")
			return
		}
		writeErr(w, http.StatusBadRequest, "bad json: "+err.Error())
		return
	}
	message := strings.TrimSpace(req.Message)
	if message == "" {
		writeErr(w, http.StatusBadRequest, "说点什么：插话内容不能为空")
		return
	}
	if len([]rune(message)) > 2000 {
		writeErr(w, http.StatusBadRequest, "插话内容请控制在 2000 字以内")
		return
	}

	targets := []int64{}
	if req.IntentID > 0 {
		targets = append(targets, req.IntentID)
	} else {
		targets = s.engine.RunningIntentsForTask(t.ID)
	}
	if len(targets) == 0 {
		writeErr(w, http.StatusConflict,
			"这个任务当前没有正在执行的意图（可能在规划、已暂停或已结束）。等 worker 真正开跑后再发，或先恢复任务；"+
				"想打断当前这轮再交代，请到「会话」页暂停该意图后用发送消息。")
		return
	}

	type deliveredItem struct {
		IntentID int64 `json:"intent_id"`
		Pending  int   `json:"pending"`
	}
	delivered := make([]deliveredItem, 0, len(targets))
	skipped := make([]int64, 0)
	for _, id := range targets {
		if err := s.engine.SteerWorkFrom(id, message, "operator"); err != nil {
			// 意图刚好跑完：不是致命错误，如实汇报即可。
			skipped = append(skipped, id)
			continue
		}
		delivered = append(delivered, deliveredItem{IntentID: id, Pending: s.engine.PendingSteers(id)})
	}
	if len(delivered) == 0 {
		writeErr(w, http.StatusConflict, "刚那批意图都结束了，这句话没送到。看看任务是不是已经跑完或换了方向。")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"delivered": delivered,
		"skipped":   skipped,
	})
}
