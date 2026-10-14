//go:build embedui

package server

import (
	"embed"
	"io/fs"
	"net/http"
)

// webuiDist contains two independently-built frontends. Codex is served at /,
// while the original ARTEX Next app is mounted at /artex/. The all: prefixes
// include Next's leading-underscore _next asset directory.
//
//go:embed all:webui/dist
var webuiDist embed.FS

// webuiHandler serves the embedded UIs. Public (no JWT) — auth is enforced
// client-side and on /api. The two filesystem roots are isolated so deep-link
// fallbacks and assets cannot cross between the renderers.
func (s *Server) webuiHandler() http.Handler {
	codex, err := fs.Sub(webuiDist, "webui/dist/codex")
	if err != nil {
		panic(err)
	}
	native, err := fs.Sub(webuiDist, "webui/dist/artex")
	if err != nil {
		panic(err)
	}
	return newDualWebUIHandler(codex, native)
}
