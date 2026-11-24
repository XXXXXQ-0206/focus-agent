package server

import (
	"testing"

	"github.com/Autumn-27/artex/agent"
)

// 批 5 B2:dsnPassword 从两种 DSN 形态提取密码(URL / keyword),无密码返回空。
func TestDSNPassword(t *testing.T) {
	cases := []struct {
		dsn, want string
	}{
		{"postgres://artex:s3cr3t@127.0.0.1:5432/artex?sslmode=disable", "s3cr3t"},
		{"postgres://artex@127.0.0.1:5432/artex", ""},
		{"host=127.0.0.1 user=artex password=pw123456 dbname=artex", "pw123456"},
		{"host=127.0.0.1 password='pw with space' dbname=artex", "pw with space"},
		{"host=127.0.0.1 dbname=artex", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := dsnPassword(c.dsn); got != c.want {
			t.Errorf("dsnPassword(%q) = %q, want %q", c.dsn, got, c.want)
		}
	}
}

// 批 5 B4:uaForTask 在无 DB 时用默认池,且同任务稳定(有 DB 的路径依赖 PG,
// 由集成环境覆盖,单测不打 DSN)。
func TestUAForTaskDefaultPool(t *testing.T) {
	s := &Server{} // m == nil → 默认池
	ua := s.uaForTask(42)
	if ua == "" {
		t.Fatal("uaForTask should return a default-pool UA without a DB")
	}
	if got := s.uaForTask(42); got != ua {
		t.Fatalf("same task must keep the same UA: %q vs %q", ua, got)
	}
	pool := agent.DefaultUAPool()
	found := false
	for _, p := range pool {
		if p == ua {
			found = true
		}
	}
	if !found {
		t.Fatalf("uaForTask without settings should pick from the default pool, got %q", ua)
	}
}
