// Package guard implements the safety boundary layer (docs §11): an audit log,
// user-configured intercept-rule evaluation, RoE authorization-scope enforcement
// (F5, see roe.go — Bash/HTTP 工具的交互目标与任务 task_scope 比对), and
// Observer/G5 failure attribution. Every tool call passes through the PreToolUse
// hook before executing. Destructive/exfil gating is no longer hard-coded here —
// it lives in the DB intercept rules (seeded as ordinary [内置] rules, so users
// can disable or delete them), evaluated via applyIntercept.
package guard

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"sync"
	"time"

	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/hook"
)

// AuditEntry records one gated tool call.
type AuditEntry struct {
	TS      int64  `json:"ts"`
	Tool    string `json:"tool"`
	Action  string `json:"action"` // allow|block
	Reason  string `json:"reason,omitempty"`
	Command string `json:"command,omitempty"`
}

// Guard enforces the side-effect policy via agent-core hooks.
type Guard struct {
	mu          sync.Mutex
	audit       []AuditEntry
	attrib      map[string]int // failure attribution counts (Observer / G5)
	reg         *hook.Registry
	interceptor *intercept.Interceptor // optional; nil disables user-configured rules
	roe         RoEConfig              // optional; Scope==nil disables the RoE check
	egress      *EgressGuard           // optional; 批 5 B2 出口审查(敏感指纹拦截),nil 关闭
	tarpit      *tarpitState           // optional; 批 5 B3 tarpit 熔断,nil 关闭
}

// New creates a Guard without user-configured intercept rules (used for pentest
// tasks where the Interceptor is not yet available).
func New() *Guard { return newGuard(nil) }

// NewWithInterceptor creates a Guard with user-configured intercept rules.
func NewWithInterceptor(ic *intercept.Interceptor) *Guard { return newGuard(ic) }

func newGuard(ic *intercept.Interceptor) *Guard {
	g := &Guard{attrib: map[string]int{}, interceptor: ic}
	g.reg = hook.NewRegistry().
		On(hook.PreToolUse, g.preToolUse).
		On(hook.PostToolUse, g.postToolUse)
	return g
}

// Hooks returns the hook registry to attach to an agent session.
func (g *Guard) Hooks() *hook.Registry { return g.reg }

func (g *Guard) preToolUse(ctx context.Context, ev hook.Event) hook.Result {
	// Extract the shell-command surface for the audit log: Bash + the interactive-shell
	// tools (shell_open's command, shell_send's text). Destructive/exfil gating is no
	// longer hard-coded here — it now lives in the DB intercept rules, evaluated by
	// applyIntercept below. Other tools record an empty command.
	var cmd string
	switch ev.ToolName {
	case "Bash", "shell_open":
		var in struct {
			Command string `json:"command"`
		}
		_ = json.Unmarshal(ev.Input, &in)
		cmd = in.Command
	case "shell_send":
		var in struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(ev.Input, &in)
		cmd = in.Text
	}
	// 批 5 B2 出口审查:出站内容含平台敏感指纹(LLM key/jwt.key/gate 路径/PG 密码/
	// callback_addr)即 deny,先于一切其他检查(含下方的 allow 审计——命中时命令
	// 原文本身就可能带秘密,不能落盘)——这类 deny 不走拦截规则,也不被一键放行
	// 豁免。审计只记 kind,不落指纹/原文。
	if res, stop := g.checkEgress(ev, cmd); stop {
		return res
	}
	g.record(ev.ToolName, "allow", "", cmd)
	// RoE 授权范围检查(F5):Bash/HTTP 类工具的交互目标与 task_scope 比对,
	// 先于用户拦截规则;Out+strict 走 ask,Out+warn 只记审计。
	if res, stop := g.checkRoE(ctx, ev, cmd); stop {
		return res
	}
	// 批 5 B3 tarpit 熔断:每 host 抓取计数,超预算写一次 hint 提示 planner,
	// 之后对该 host 仍 warn 放行(不硬 block,防误杀真实大站)。
	g.checkTarpit(ev)
	return g.applyIntercept(ctx, ev)
}

// SetEgress 装配出口审查的敏感指纹集合(server 侧进程内共享一份,见 egress.go)。
// nil = 关闭。
func (g *Guard) SetEgress(e *EgressGuard) {
	g.mu.Lock()
	g.egress = e
	g.mu.Unlock()
}

// checkEgress 是 PreToolUse 第一道:对 Bash 类命令全文与 WebFetch 的 url/body
// 做敏感指纹检查,命中 → deny("操作包含平台敏感信息,禁止外发")。
func (g *Guard) checkEgress(ev hook.Event, cmd string) (hook.Result, bool) {
	g.mu.Lock()
	e := g.egress
	g.mu.Unlock()
	if e == nil {
		return hook.Result{}, false
	}
	var texts []string
	if cmd != "" {
		texts = append(texts, cmd)
	}
	if ev.ToolName == "WebFetch" {
		var in struct {
			URL  string `json:"url"`
			Body string `json:"body"`
		}
		if json.Unmarshal(ev.Input, &in) == nil {
			texts = append(texts, in.URL, in.Body)
		}
	}
	for _, text := range texts {
		if text == "" {
			continue
		}
		if kind, hit := e.Check(text); hit {
			// 审计/日志只记 kind:命令原文可能本身就含敏感信息,不落盘;
			// block 文案也不带命中内容,防止把指纹回显给模型。
			log.Printf("[guard][egress] 命中平台敏感指纹(%s),%s 外发已拦截", kind, ev.ToolName)
			return g.block(ev.ToolName, systemBlockMessage("操作包含平台敏感信息，禁止外发"), ""), true
		}
	}
	return hook.Result{}, false
}

// applyIntercept evaluates user-configured intercept rules against the tool call.
// Both rules and the fallback judge receive the complete tool input.
func (g *Guard) applyIntercept(ctx context.Context, ev hook.Event) hook.Result {
	if g.interceptor == nil {
		return hook.Result{}
	}
	if !g.interceptor.IsToolEnabled(ev.ToolName) {
		return hook.Result{}
	}
	ctx = intercept.WithCall(ctx, ev.ToolName, ev.Input)
	dec, matched := g.interceptor.Match(ev.ToolName, ev.Input)
	if !matched {
		// No rule matched. Ask the LLM fallback judge (if enabled); when it is off
		// or unwired, keep current behavior and allow.
		d, judged := g.interceptor.Judge(ctx, ev.ToolName, ev.Input)
		if !judged {
			return hook.Result{}
		}
		dec = d
	}
	switch dec.Action {
	case "deny":
		// 观测:deny 命中不阻塞审批,直接记一条 denied（历史/任务拦截页可见）。
		g.interceptor.Log(ctx, intercept.ConvIDFromContext(ctx), dec, ev.ToolName, ev.Input, "denied")
		return g.block(ev.ToolName, systemBlockMessage(dec.Message), "")
	case "allow":
		// Record explicit rule and model approvals so review details remain auditable.
		g.interceptor.Log(ctx, intercept.ConvIDFromContext(ctx), dec, ev.ToolName, ev.Input, "allowed")
		return hook.Result{}
	case "ask":
		// If the worker context is already cancelled (task stopped / killed), block
		// immediately without creating a pending record — avoids orphaned DB entries
		// and makes execOne complete fast, reducing the race against drainSynthetic.
		if ctx.Err() != nil {
			return g.block(ev.ToolName, systemBlockMessage("工作已取消，平台安全管控阻止执行"), "")
		}
		convID := intercept.ConvIDFromContext(ctx)
		if !g.interceptor.HandleAsk(ctx, convID, dec, ev.ToolName, ev.Input) {
			return g.block(ev.ToolName, systemBlockMessage("人工审批未通过（用户拒绝或审批超时）"), "")
		}
		return hook.Result{}
	}
	return hook.Result{}
}

// systemBlockMessage frames an intercept block as an ARTEX platform-governance
// decision so the agent does not mistake it for a target-side defense.
//
// The bare reasons ("禁止执行此工具" / "用户拒绝") read exactly like a WAF/403 on
// the target, so a pentest agent's instinct is to bypass them — rewrite the
// command, swap the payload, re-encode, retry. That is both futile (the platform
// blocks the class of action, not one string) and wrong (it's a policy decision,
// not an obstacle to defeat). This prefix states plainly that the block comes
// from the platform, is not the target's protection, and that the operation is
// forbidden — so the agent pivots to another approach instead of evading it.
// Audit/history rows keep the raw reason (see Interceptor.Log); only the
// model-facing tool_result carries this framing.
func systemBlockMessage(reason string) string {
	return "【ARTEX 平台管控·非目标防御】此调用被平台拦截。" +
		"原因：" + reason + "。此操作被禁止。"
}

var reBlocked = regexp.MustCompile(`(?i)\b(403|forbidden|waf|blocked|rate.?limit|429|captcha|denied)\b`)

// postToolUse is the Observer failure-attribution hook (G5): it classifies tool
// results into blocked / error / ok so the planner can change strategy instead
// of giving up at a WAF.
func (g *Guard) postToolUse(_ context.Context, ev hook.Event) hook.Result {
	if ev.ToolName != "Bash" {
		return hook.Result{}
	}
	class := "ok"
	switch {
	case reBlocked.Match(ev.Result):
		class = "blocked"
	case ev.IsError:
		class = "error"
	}
	g.mu.Lock()
	g.attrib[class]++
	g.mu.Unlock()
	return hook.Result{}
}

// Attributions returns failure-attribution counts (Observer / G5).
func (g *Guard) Attributions() map[string]int {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make(map[string]int, len(g.attrib))
	for k, v := range g.attrib {
		out[k] = v
	}
	return out
}

func (g *Guard) block(tool, reason, cmd string) hook.Result {
	g.record(tool, "block", reason, cmd)
	return hook.Result{Decision: "block", Message: reason}
}

func (g *Guard) record(tool, action, reason, cmd string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.audit = append(g.audit, AuditEntry{TS: time.Now().Unix(), Tool: tool, Action: action, Reason: reason, Command: cmd})
	if len(g.audit) > 2000 {
		g.audit = g.audit[len(g.audit)-2000:]
	}
}

// Audit returns a snapshot of recent gated calls (most recent last).
func (g *Guard) Audit() []AuditEntry {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]AuditEntry, len(g.audit))
	copy(out, g.audit)
	return out
}
