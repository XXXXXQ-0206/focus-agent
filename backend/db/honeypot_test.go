package db

import "testing"

func TestMergeHoneypotEvidence(t *testing.T) {
	// 空旧值 + 新证据
	got := MergeHoneypotEvidence("", []string{"a(X, 0.90)"})
	if got != `["a(X, 0.90)"]` {
		t.Fatalf("from empty: %q", got)
	}
	// 合并去重,保序
	got = MergeHoneypotEvidence(`["a(X, 0.90)"]`, []string{"a(X, 0.90)", "b(Y, 0.85)"})
	if got != `["a(X, 0.90)","b(Y, 0.85)"]` {
		t.Fatalf("dedup merge: %q", got)
	}
	// 旧值损坏按无旧值处理,不丢新证据
	got = MergeHoneypotEvidence("garbage", []string{"a(X, 0.90)"})
	if got != `["a(X, 0.90)"]` {
		t.Fatalf("corrupt old: %q", got)
	}
	// 双方都空
	if got := MergeHoneypotEvidence("", nil); got != "" {
		t.Fatalf("both empty: %q", got)
	}
}
