//go:build embedui

package server

import (
	"embed"
	"io/fs"
	"net/http"
)

// webuiDist contains the Focus renderer, served at /.
//
//go:embed all:webui/dist
var webuiDist embed.FS

// webuiHandler serves the embedded renderer. Public (no JWT) — auth is enforced
// client-side and on /api.
func (s *Server) webuiHandler() http.Handler {
	focus, err := fs.Sub(webuiDist, "webui/dist/codex")
	if err != nil {
		panic(err)
	}
	return newWebUIHandler(focus)
}
