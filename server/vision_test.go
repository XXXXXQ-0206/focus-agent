package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestImageAttachmentsStaysInsideChatDir pins the security boundary of the vision
// pre-pass: the message body is client-controlled, so only images that resolve inside
// the conversation's working dir may be read (no `..`, no absolute outside paths).
func TestImageAttachmentsStaysInsideChatDir(t *testing.T) {
	root := t.TempDir()
	uploads := filepath.Join(root, "uploads")
	if err := os.MkdirAll(uploads, 0o755); err != nil {
		t.Fatal(err)
	}
	inside := filepath.Join(uploads, "ok.png")
	if err := os.WriteFile(inside, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	outsideDir := t.TempDir()
	outside := filepath.Join(outsideDir, "secret.png")
	if err := os.WriteFile(outside, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := imageAttachments([]chatAttachment{
		{Name: "relative.png", Path: "uploads/ok.png"},
		{Name: "absolute.png", Abs: inside},
		{Name: "escape.png", Path: filepath.Join("..", "secret.png")},
		{Name: "outside.png", Abs: outside},
		{Name: "notes.txt", Path: "uploads/notes.txt"},
	}, root)

	if len(got) != 2 {
		t.Fatalf("want the two in-dir images, got %d: %+v", len(got), got)
	}
	for _, img := range got {
		rel, err := filepath.Rel(root, img.Path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			t.Fatalf("accepted a path outside the chat dir: %s", img.Path)
		}
	}
}
