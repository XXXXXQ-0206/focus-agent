package textutil

import (
	"strings"
	"testing"
)

func TestFirstLine(t *testing.T) {
	tests := []struct {
		name string
		in   string
		max  int
		want string
	}{
		{name: "trim and LF", in: "  first\nsecond", max: 20, want: "first"},
		{name: "CRLF", in: "first\r\nsecond", max: 20, want: "first"},
		{name: "rune cap", in: strings.Repeat("恢复", 4), max: 5, want: "恢复恢复恢…"},
		{name: "zero cap", in: "abc", max: 0, want: "…"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := FirstLine(test.in, test.max); got != test.want {
				t.Fatalf("FirstLine() = %q, want %q", got, test.want)
			}
		})
	}
}
