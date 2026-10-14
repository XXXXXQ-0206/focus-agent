package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestDualWebUIRoutesAreIsolated(t *testing.T) {
	codex := fstest.MapFS{
		"index.html":            {Data: []byte("codex root")},
		"assets/app-abc123.js":  {Data: []byte("codex asset")},
		"assets/app-abc123.css": {Data: []byte("codex style")},
		"favicon.svg":           {Data: []byte("codex icon")},
	}
	native := fstest.MapFS{
		"index.html":                         {Data: []byte("native root")},
		"function/tasks/detail/index.html":   {Data: []byte("native task detail")},
		"_next/static/chunks/app-abc123.js":  {Data: []byte("native asset")},
		"_next/static/chunks/app-abc123.css": {Data: []byte("native style")},
	}
	handler := newDualWebUIHandler(codex, native)

	tests := []struct {
		name        string
		path        string
		wantStatus  int
		wantBody    string
		wantCache   string
		wantContent string
	}{
		{name: "codex root", path: "/", wantStatus: http.StatusOK, wantBody: "codex root", wantCache: "no-cache", wantContent: "text/html"},
		{name: "codex deep link", path: "/task/42", wantStatus: http.StatusOK, wantBody: "codex root", wantCache: "no-cache", wantContent: "text/html"},
		{name: "codex hashed asset", path: "/assets/app-abc123.js", wantStatus: http.StatusOK, wantBody: "codex asset", wantCache: "public, max-age=31536000, immutable", wantContent: "javascript"},
		{name: "native root", path: "/artex/", wantStatus: http.StatusOK, wantBody: "native root", wantCache: "no-cache", wantContent: "text/html"},
		{name: "native exported deep link", path: "/artex/function/tasks/detail/", wantStatus: http.StatusOK, wantBody: "native task detail", wantCache: "no-cache", wantContent: "text/html"},
		{name: "native hashed asset", path: "/artex/_next/static/chunks/app-abc123.js", wantStatus: http.StatusOK, wantBody: "native asset", wantCache: "public, max-age=31536000, immutable", wantContent: "javascript"},
		{name: "missing codex asset", path: "/assets/missing.svg", wantStatus: http.StatusNotFound},
		{name: "missing native asset", path: "/artex/_next/static/missing.js", wantStatus: http.StatusNotFound},
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

func TestNativeRootRedirectsToTrailingSlash(t *testing.T) {
	handler := newDualWebUIHandler(fstest.MapFS{"index.html": {Data: []byte("codex")}}, fstest.MapFS{"index.html": {Data: []byte("native")}})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/artex", nil))
	if response.Code != http.StatusPermanentRedirect {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusPermanentRedirect)
	}
	if got := response.Header().Get("Location"); got != "/artex/" {
		t.Fatalf("Location = %q, want /artex/", got)
	}
}

func TestDualWebUIRejectsMethodsOtherThanGetAndHead(t *testing.T) {
	handler := newDualWebUIHandler(fstest.MapFS{"index.html": {Data: []byte("codex")}}, fstest.MapFS{"index.html": {Data: []byte("native")}})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
	if got := response.Header().Get("Allow"); got != "GET, HEAD" {
		t.Fatalf("Allow = %q, want GET, HEAD", got)
	}
}
