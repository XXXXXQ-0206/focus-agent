package server

import (
	"context"
	"strings"
	"testing"
)

// 操作员插话（task_steer）：排进 steerBox → worker 下一次工具调用被拦下 →
// 注入文案标成"操作员"，而不是"规划者"。
func TestSteerWorkFromOperatorInjectsOperatorLabelledCorrection(t *testing.T) {
	e := NewEngine(nil)
	_, cancel := context.WithCancelCause(context.Background())
	e.registerWork(42, "t1", cancel)

	if err := e.SteerWorkFrom(42, "别再扫了，先回到登录接口", steerFromOperator); err != nil {
		t.Fatalf("SteerWorkFrom: %v", err)
	}
	if got := e.PendingSteers(42); got != 1 {
		t.Fatalf("PendingSteers = %d, want 1", got)
	}

	hooks := steerHooks{drain: func() (steerMsg, bool) { return e.drainSteer(42) }}
	block, msg, _ := hooks.PreToolUse(context.Background(), "Bash", []byte(`{"command":"nmap -sV target"}`))
	if !block {
		t.Fatal("queued correction must block the next tool call")
	}
	if !strings.Contains(msg, "【操作员实时纠偏】") {
		t.Fatalf("correction must be labelled as operator, got: %s", msg)
	}
	if !strings.Contains(msg, "别再扫了，先回到登录接口") {
		t.Fatalf("correction text missing: %s", msg)
	}
	if got := e.PendingSteers(42); got != 0 {
		t.Fatalf("PendingSteers after drain = %d, want 0", got)
	}
}

// 规划者工具走同一条队列，但文案必须保持"规划者"，两条来源不能串。
func TestSteerWorkKeepsPlannerLabel(t *testing.T) {
	e := NewEngine(nil)
	_, cancel := context.WithCancelCause(context.Background())
	e.registerWork(7, "t1", cancel)

	if err := e.SteerWork(7, "换个 payload"); err != nil {
		t.Fatalf("SteerWork: %v", err)
	}
	hooks := steerHooks{drain: func() (steerMsg, bool) { return e.drainSteer(7) }}
	_, msg, _ := hooks.PreToolUse(context.Background(), "Bash", []byte("{}"))
	if !strings.Contains(msg, "【规划者实时纠偏】") {
		t.Fatalf("planner correction must stay planner-labelled, got: %s", msg)
	}
}

// 没有在跑的意图时插话要明确报错，而不是静默排队（否则消息永远不会被投递）。
func TestSteerWorkRejectsWhenNoRunningWork(t *testing.T) {
	e := NewEngine(nil)
	if err := e.SteerWorkFrom(99, "hello", steerFromOperator); err == nil {
		t.Fatal("steering an intent with no running work must fail")
	}
	if err := e.SteerWorkFrom(99, "   ", steerFromOperator); err == nil {
		t.Fatal("blank message must fail")
	}
}

// 任务级广播目标：只返回该任务在跑的意图，且升序。
func TestRunningIntentsForTaskFiltersAndSorts(t *testing.T) {
	e := NewEngine(nil)
	_, c1 := context.WithCancelCause(context.Background())
	_, c2 := context.WithCancelCause(context.Background())
	_, c3 := context.WithCancelCause(context.Background())
	e.registerWork(20, "t1", c1)
	e.registerWork(11, "t1", c2)
	e.registerWork(30, "t2", c3)

	got := e.RunningIntentsForTask("t1")
	if len(got) != 2 || got[0] != 11 || got[1] != 20 {
		t.Fatalf("RunningIntentsForTask(t1) = %v, want [11 20]", got)
	}
	if other := e.RunningIntentsForTask("t2"); len(other) != 1 || other[0] != 30 {
		t.Fatalf("RunningIntentsForTask(t2) = %v, want [30]", other)
	}
	if none := e.RunningIntentsForTask("t3"); len(none) != 0 {
		t.Fatalf("RunningIntentsForTask(t3) = %v, want empty", none)
	}
}
