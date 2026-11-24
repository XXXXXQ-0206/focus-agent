package server

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRemoveConversationUploads(t *testing.T) {
	dataDir := t.TempDir()
	uploads := filepath.Join(dataDir, "sessions", "conv-7", "uploads")
	if err := os.MkdirAll(uploads, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(uploads, "screen.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(dataDir, "sessions", "conv-8", "uploads")
	if err := os.MkdirAll(keep, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := removeConversationUploads(dataDir, 7); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(uploads); !os.IsNotExist(err) {
		t.Fatalf("conversation uploads still exist: %v", err)
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatalf("unrelated conversation uploads removed: %v", err)
	}
}
