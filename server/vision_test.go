package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/norma/llm"
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

func TestVisionReadImagesUsesProviderNativeRequest(t *testing.T) {
	imagePath := filepath.Join(t.TempDir(), "screen.png")
	if err := os.WriteFile(imagePath, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	image := visionImage{Name: "screen.png", Path: imagePath}

	tests := []struct {
		format         llm.Format
		wantPath       string
		wantTokenField string
		wantImageType  string
		wantText       string
		response       string
	}{
		{
			format:         "openai",
			wantPath:       "/v1/chat/completions",
			wantTokenField: "max_completion_tokens",
			wantImageType:  "image_url",
			wantText:       "chat-ok",
			response:       `{"choices":[{"message":{"content":"chat-ok"}}]}`,
		},
		{
			format:         "openai-responses",
			wantPath:       "/v1/responses",
			wantTokenField: "max_output_tokens",
			wantImageType:  "input_image",
			wantText:       "responses-ok",
			response:       `{"output":[{"type":"message","content":[{"type":"output_text","text":"responses-ok"}]}]}`,
		},
	}

	for _, tt := range tests {
		t.Run(string(tt.format), func(t *testing.T) {
			var (
				gotPath    string
				gotAuth    string
				gotSession string
				payload    map[string]any
			)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				gotAuth = r.Header.Get("Authorization")
				gotSession = r.Header.Get("X-Focus-Session")
				raw, _ := io.ReadAll(r.Body)
				_ = json.Unmarshal(raw, &payload)
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, tt.response)
			}))
			defer server.Close()

			s := &Server{}
			got, err := s.visionReadImages(context.Background(), agent.Config{
				Format:           tt.format,
				BaseURL:          server.URL + "/v1",
				Model:            "vision-model",
				APIKey:           "sk-test",
				MaxTokens:        32,
				MaxTokensField:   "max_completion_tokens",
				SessionHeaderKey: "X-Focus-Session",
			}, "describe", []visionImage{image}, "conv-7")
			if err != nil {
				t.Fatal(err)
			}
			if gotPath != tt.wantPath {
				t.Fatalf("path=%q, want %q", gotPath, tt.wantPath)
			}
			if gotAuth != "Bearer sk-test" || gotSession != "conv-7" {
				t.Fatalf("headers auth=%q session=%q", gotAuth, gotSession)
			}
			if payload[tt.wantTokenField] != float64(4096) {
				t.Fatalf("%s=%v, want 4096", tt.wantTokenField, payload[tt.wantTokenField])
			}
			encoded, _ := json.Marshal(payload)
			if !strings.Contains(string(encoded), `"`+tt.wantImageType+`"`) ||
				!strings.Contains(string(encoded), "data:image/png;base64,") {
				t.Fatalf("payload lacks provider-native image part: %s", encoded)
			}
			if !strings.Contains(got, tt.wantText) {
				t.Fatalf("result=%q does not contain %q", got, tt.wantText)
			}
		})
	}
}
