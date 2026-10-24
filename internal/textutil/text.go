package textutil

import (
	"strings"
	"unicode/utf8"
)

// FirstLine returns a whitespace-trimmed, rune-capped preview of the first line.
func FirstLine(text string, maxRunes int) string {
	text = strings.TrimSpace(text)
	if index := strings.IndexAny(text, "\r\n"); index >= 0 {
		text = text[:index]
	}
	if maxRunes < 0 {
		maxRunes = 0
	}
	if utf8.RuneCountInString(text) > maxRunes {
		text = string([]rune(text)[:maxRunes]) + "…"
	}
	return text
}
