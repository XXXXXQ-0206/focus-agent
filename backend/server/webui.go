package server

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// newWebUIHandler serves the single Focus renderer at /. The original ARTEX Next
// app is gone; /artex and /artex/* are kept only as permanent redirects so old
// bookmarks and desktop links still land on Focus.
func newWebUIHandler(focus fs.FS) http.Handler {
	handler := staticFrontendHandler(focus, true)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/artex" || strings.HasPrefix(r.URL.Path, "/artex/") {
			http.Redirect(w, r, "/", http.StatusPermanentRedirect)
			return
		}
		handler.ServeHTTP(w, r)
	})
}

func staticFrontendHandler(fsys fs.FS, spaFallback bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested := strings.TrimPrefix(r.URL.Path, "/")
		clean := path.Clean(requested)
		if clean == "." {
			clean = "index.html"
		}
		if !fs.ValidPath(clean) {
			http.NotFound(w, r)
			return
		}
		for _, candidate := range []string{clean, path.Join(clean, "index.html"), clean + ".html"} {
			if serveFileIfExists(w, r, fsys, candidate) {
				return
			}
		}
		if spaFallback && !isStaticAssetPath(clean) && serveFileIfExists(w, r, fsys, "index.html") {
			return
		}
		http.NotFound(w, r)
	})
}

// isStaticAssetPath 判断一个请求路径是否"静态资产"（是则**不做** SPA 回落）。
//
// 2026-10-15 修正：早先的实现扫描**所有段**，只要任一段等于 assets/static/… 就判静态 ——
// 于是任何含 "assets" 段的前端路由（例如 /function/assets）都拿不到 SPA 回落，
// 直接吃到 Go 的「404 page not found」而不是应用内的重定向。
// 现在只看**首段**（构建产物的资产目录都在根：/assets、/_next、/static…），
// 带扩展名的路径仍按静态处理。
func isStaticAssetPath(name string) bool {
	first, _, _ := strings.Cut(name, "/")
	switch first {
	case "_next", "assets", "static", "fonts", "images":
		return true
	}
	return path.Ext(name) != ""
}

func setWebUICacheHeaders(w http.ResponseWriter, name string) {
	if strings.HasPrefix(name, "_next/static/") || strings.HasPrefix(name, "assets/") && path.Ext(name) != "" {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
}

func serveFileIfExists(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	f, err := fsys.Open(name)
	if err != nil {
		return false
	}
	info, statErr := f.Stat()
	_ = f.Close()
	if statErr != nil || info.IsDir() {
		return false
	}
	setWebUICacheHeaders(w, name)
	http.ServeFileFS(w, r, fsys, name)
	return true
}
