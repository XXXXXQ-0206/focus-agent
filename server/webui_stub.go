//go:build !embedui

package server

import "net/http"

// webuiHandler is the no-embed stub (default build). The frontend is NOT bundled
// into this binary. During development run both renderers separately:
// `cd frontends/codex-client && npm run dev -- --port 3000` and
// `cd frontends/artex-web && npm run dev -- --port 3001`. Build the bundled
// single-binary with ./build.sh and the embedui build tag.
//
//	./build.sh
func (s *Server) webuiHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "前端未内嵌到此二进制（开发用 next dev；发布用 -tags embedui 构建）", http.StatusNotFound)
	})
}
