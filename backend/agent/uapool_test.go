package agent

import (
	"strings"
	"testing"
)

// 批 5 B4:默认池存在且是主流 Chrome(Windows x64);settings 未配置/非法时回落默认池。
func TestUAPoolDefaults(t *testing.T) {
	pool := DefaultUAPool()
	if len(pool) < 2 {
		t.Fatalf("default UA pool should have >=2 entries, got %d", len(pool))
	}
	for _, ua := range pool {
		if !strings.Contains(ua, "Chrome/") || !strings.Contains(ua, "Windows NT 10.0; Win64; x64") {
			t.Fatalf("default UA should be mainstream Chrome on Windows x64: %q", ua)
		}
	}
	// 未配置 / 非法 JSON / 空数组 / 全空条目 → 默认池。
	for _, raw := range []string{"", "not-json", "[]", `["", "  "]`} {
		got := UAPoolFromSetting(raw)
		if len(got) != len(pool) || got[0] != pool[0] {
			t.Fatalf("UAPoolFromSetting(%q) should fall back to default pool, got %v", raw, got)
		}
	}
	// 合法配置:解析并剔除空条目。
	got := UAPoolFromSetting(`["UA-A", " ", "UA-B"]`)
	if len(got) != 2 || got[0] != "UA-A" || got[1] != "UA-B" {
		t.Fatalf("custom pool should parse and trim, got %v", got)
	}
}

// 批 5 B4:同任务稳定(每次调用同一个),不同任务可不同,空池回落默认。
func TestUAPickStable(t *testing.T) {
	pool := DefaultUAPool()
	first := PickUA(pool, 42)
	for range 10 {
		if got := PickUA(pool, 42); got != first {
			t.Fatalf("same task must keep the same UA: %q vs %q", first, got)
		}
	}
	seen := map[string]bool{}
	for id := int64(1); id <= 100; id++ {
		seen[PickUA(pool, id)] = true
	}
	if len(seen) < 2 {
		t.Fatalf("different tasks should be able to get different UAs, got %v", seen)
	}
	// 空池 → 默认池,且非空。
	if ua := PickUA(nil, 7); ua == "" {
		t.Fatal("nil pool should fall back to the default pool")
	}
}

// 批 5 B4:BashEnv 注入——ua 非空追加 ARTEX_UA,为空原样返回。
func TestUAEnv(t *testing.T) {
	env := uaEnv(nil, "UA-X")
	if len(env) != 1 || env[0] != "ARTEX_UA=UA-X" {
		t.Fatalf("uaEnv should append ARTEX_UA, got %v", env)
	}
	base := []string{"HTTP_PROXY=http://127.0.0.1:8080"}
	got := uaEnv(base, "")
	if len(got) != 1 || got[0] != base[0] {
		t.Fatalf("empty ua must leave env unchanged, got %v", got)
	}
}
