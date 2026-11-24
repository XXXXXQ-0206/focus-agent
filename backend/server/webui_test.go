package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestWebUIServesFocusAtRoot(t *testing.T) {
	focus := fstest.MapFS{
		"index.html":            {Data: []byte("focus root")},
		"assets/app-abc123.js":  {Data: []byte("focus asset")},
		"assets/app-abc123.css": {Data: []byte("focus style")},
		"favicon.ico":           {Data: []byte("focus icon")},
	}
	handler := newWebUIHandler(focus)

	tests := []struct {
		name        string
		path        string
		wantStatus  int
		wantBody    string
		wantCache   string
		wantContent string
	}{
		{name: "root", path: "/", wantStatus: http.StatusOK, wantBody: "focus root", wantCache: "no-cache", wantContent: "text/html"},
		{name: "deep link", path: "/task/42", wantStatus: http.StatusOK, wantBody: "focus root", wantCache: "no-cache", wantContent: "text/html"},
		{name: "hashed asset", path: "/assets/app-abc123.js", wantStatus: http.StatusOK, wantBody: "focus asset", wantCache: "public, max-age=31536000, immutable", wantContent: "javascript"},
		{name: "missing asset", path: "/assets/missing.svg", wantStatus: http.StatusNotFound},
		{name: "API is never a UI fallback", path: "/api/health", wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if response.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body=%q", response.Code, tt.wantStatus, response.Body.String())
			}
			if tt.wantBody != "" && !strings.Contains(response.Body.String(), tt.wantBody) {
				t.Fatalf("body %q does not contain %q", response.Body.String(), tt.wantBody)
			}
			if tt.wantCache != "" && response.Header().Get("Cache-Control") != tt.wantCache {
				t.Fatalf("Cache-Control = %q, want %q", response.Header().Get("Cache-Control"), tt.wantCache)
			}
			if tt.wantContent != "" && !strings.Contains(response.Header().Get("Content-Type"), tt.wantContent) {
				t.Fatalf("Content-Type = %q, want substring %q", response.Header().Get("Content-Type"), tt.wantContent)
			}
		})
	}
}

func TestLegacyArtexPathsRedirectToFocus(t *testing.T) {
	handler := newWebUIHandler(fstest.MapFS{"index.html": {Data: []byte("focus")}})
	for _, path := range []string{"/artex", "/artex/", "/artex/function/tasks"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusPermanentRedirect {
			t.Fatalf("%s: status = %d, want %d", path, response.Code, http.StatusPermanentRedirect)
		}
		if got := response.Header().Get("Location"); got != "/" {
			t.Fatalf("%s: Location = %q, want /", path, got)
		}
	}
}

func TestWebUIRejectsMethodsOtherThanGetAndHead(t *testing.T) {
	handler := newWebUIHandler(fstest.MapFS{"index.html": {Data: []byte("focus")}})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
	if got := response.Header().Get("Allow"); got != "GET, HEAD" {
		t.Fatalf("Allow = %q, want GET, HEAD", got)
	}
}
