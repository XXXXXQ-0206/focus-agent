package agent

import (
	"strings"
	"testing"
)

// 批 5 B1:反 AI 蜜罐红线是代码固定尾——非内网 worker 必含红线段,内网 worker
// 两段(反 AI 红线 + 内网红线)都在;DB 编辑正文覆盖不掉红线段。
func TestWorkerSystemAntiTrapRules(t *testing.T) {
	t.Cleanup(func() { PromptOverride = nil })
	PromptOverride = nil

	// 非内网:含反 AI 红线,不含内网红线。
	ext := workerSystem("", "", "/data", "/data", false)
	if !strings.Contains(ext, "反 AI 蜜罐红线") {
		t.Fatalf("non-intranet worker missing anti-trap rules: %q", ext)
	}
	if strings.Contains(ext, "内网红线") {
		t.Fatalf("non-intranet worker must not append 内网红线尾: %q", ext)
	}

	// 内网:两段红线都在。
	in := workerSystem("", "", "/data", "/data", true)
	if !strings.Contains(in, "反 AI 蜜罐红线") || !strings.Contains(in, "内网红线") {
		t.Fatalf("intranet worker should carry both rule tails: %q", in)
	}

	// DB 覆盖正文(含 intranet 变体)也删不掉红线段。
	PromptOverride = func(k string) (string, bool) { return "用户编辑正文", true }
	if got := workerSystem("", "", "/data", "/data", false); !strings.Contains(got, "反 AI 蜜罐红线") {
		t.Fatalf("edited body must not drop anti-trap rules: %q", got)
	}
	if got := workerSystem("", "", "/data", "/data", true); !strings.Contains(got, "反 AI 蜜罐红线") || !strings.Contains(got, "内网红线") {
		t.Fatalf("edited intranet body must not drop either rule tail: %q", got)
	}
}
