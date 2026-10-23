package server

import (
	"context"
	"encoding/json"
	"iter"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/llm"
)

type reviewCaptureProvider struct{ request llm.CompletionRequest }

func (p *reviewCaptureProvider) Stream(_ context.Context, request llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	p.request = request
	return func(yield func(llm.StreamEvent, error) bool) {
		yield(llm.StreamEvent{Type: llm.SETextDelta, Text: `{"decision":"ask","comment":"实际操作：删除文件；成功后的后果：文件会丢失，归属尚未确认；命中规则：ASK（归属不明）"}`}, nil)
	}
}
func (p *reviewCaptureProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return accumulateStreamForTest(ctx, p.Stream, req)
}

// Assert the actual model request, rather than merely the envelope helper.
func TestReviewCompletionSendsCurrentCallWithoutHistory(t *testing.T) {
	ctx := intercept.WithReviewContext(t.Context(), "/tmp/review-fixture", intercept.ReviewBackground{Source: intercept.BackgroundUserMessage, Text: "清理本次测试文件"})
	ctx, trace := intercept.WithTrace(ctx, "GLOBAL_OVERVIEW_SENTINEL", []db.InterceptContextEntry{
		{Kind: "tool_use", Tool: "Write", ToolUseID: "created", Text: `{"path":"probe.txt"}`},
		{Kind: "tool_result", ToolUseID: "created", Text: "file created"},
		{Kind: "assistant", Text: "untrusted worker speculation"},
	})
	args := json.RawMessage(`{"command":"rm probe.txt","timeout":1000}`)
	trace.Start("current", "Bash", args)
	input, err := intercept.BuildReviewInput(intercept.WithCall(ctx, "Bash", args), "Bash", args)
	if err != nil {
		t.Fatal(err)
	}
	p := &reviewCaptureProvider{}
	prompt := intercept.EffectiveJudgePrompt(intercept.DefaultJudgePrompt)
	reply, err := reviewCompletion(ctx, p, prompt, input)
	if err != nil || intercept.ParseVerdict(reply).Action != "ask" {
		t.Fatalf("%s %v", reply, err)
	}
	if len(p.request.System) != 1 || p.request.System[0] != prompt || len(p.request.Messages) != 1 {
		t.Fatal("wrong review request roles")
	}
	if !strings.Contains(prompt, intercept.JudgeOutputContract) || p.request.MaxTokens < 1024 {
		t.Fatal("review request cannot return a complete explanation")
	}
	body := p.request.Messages[0].Content[0].Text
	const (
		untrustedPrefix = "<untrusted-data source=\"tool-input\">\n"
		untrustedSuffix = "\n</untrusted-data>"
	)
	if !strings.HasPrefix(body, untrustedPrefix) || !strings.HasSuffix(body, untrustedSuffix) {
		t.Fatalf("review input is not wrapped as untrusted data: %s", body)
	}
	raw := strings.TrimSuffix(strings.TrimPrefix(body, untrustedPrefix), untrustedSuffix)
	var got intercept.ReviewInput
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &fields); err != nil {
		t.Fatal(err)
	}
	if len(fields) != 5 {
		t.Fatalf("unexpected envelope keys: %s", raw)
	}
	for _, key := range []string{"version", "working_directory", "background", "tool_name", "arguments"} {
		if _, ok := fields[key]; !ok {
			t.Fatalf("missing %s", key)
		}
	}
	if strings.Contains(raw, "file created") || strings.Contains(raw, `"path"`) {
		t.Fatal("history leaked into actual model request")
	}
	if got.Version != 4 || got.Background == nil || got.Background.Source != intercept.BackgroundUserMessage || got.Background.Text != "清理本次测试文件" || got.WorkingDir != "/tmp/review-fixture" || string(got.Arguments) != string(args) || strings.Contains(raw, "worker speculation") || strings.Contains(raw, "GLOBAL_OVERVIEW_SENTINEL") {
		t.Fatalf("wrong model input: %s", raw)
	}
}
