//go:build embedui

package server

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// webuiDist holds the statically-exported frontend (built with
// `cd web && npm run build:static`, then copied into server/webui/dist). Compiled
// into the binary only when building with `-tags embedui`. The `all:` prefix is
// required so Next's `_next/` asset dir (leading underscore) is included.
//
//go:embed all:webui/dist
var webuiDist embed.FS

// webuiHandler serves the embedded SPA. Public (no JWT) — auth is enforced
// client-side and on /api. Serves the exported per-route index.html files and
// falls back to index.html so client-side routing still resolves unknown paths.
func (s *Server) webuiHandler() http.Handler {
	root, err := fs.Sub(webuiDist, "webui/dist")
	if err != nil {
		panic(err)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		// 1) exact file (assets: _next/*, favicon.ico, ...)
		// 2) route dir → <p>/index.html (trailingSlash export)
		// 3) <p>.html
		// 4) SPA 兜底 → index.html（交给客户端路由）
		for _, cand := range []string{p, p + "/index.html", p + ".html"} {
			setWebUICacheHeaders(w, cand)
			if serveFileIfExists(w, r, root, cand) {
				return
			}
		}
		setWebUICacheHeaders(w, "index.html")
		http.ServeFileFS(w, r, root, "index.html")
	})
}

// setWebUICacheHeaders 给内嵌前端补缓存策略（embed.FS 的文件 ModTime 为零，
// http.ServeFileFS 既不发 Last-Modified 也不发 ETag，等于把缓存决策交给浏览器的
// 启发式缓存 —— 后果是 HTML 可能长期不更新，重建前端后用户仍加载旧文档）。
//
//   - _next/static/**：文件名带内容哈希 → 长缓存 + immutable
//   - 其余（HTML、favicon、icon.png…）：no-cache，每次带条件请求回源校验，
//     保证升级后立刻拿到新外壳
func setWebUICacheHeaders(w http.ResponseWriter, name string) {
	if strings.HasPrefix(name, "_next/static/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
}

// serveFileIfExists serves name from fsys when it exists as a regular file.
func serveFileIfExists(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	f, err := fsys.Open(name)
	if err != nil {
		return false
	}
	st, statErr := f.Stat()
	_ = f.Close()
	if statErr != nil || st.IsDir() {
		return false
	}
	http.ServeFileFS(w, r, fsys, name)
	return true
}
