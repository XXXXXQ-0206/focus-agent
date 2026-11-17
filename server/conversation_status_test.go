package server

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestConversationListRunningState(t *testing.T) {
	s, _ := newRetestServer(t)
	var ids []int64
	for _, key := range []string{"auto", "reporter", "retester"} {
		c, err := s.m.pg.CreateConversation(key, "runtime status test", nil)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, c.ID)
	}
	t.Cleanup(func() {
		s.chatMu.Lock()
		clear(s.chatBusy)
		s.chatMu.Unlock()
		for _, id := range ids {
			_, _ = s.m.pg.Exec(`DELETE FROM conversations WHERE id=$1`, id)
		}
	})
	check := func(want map[int64]bool) {
		t.Helper()
		w := retestRequest(s.pgListConversations, http.MethodGet, 0, "")
		if w.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", w.Code, w.Body)
		}
		var body struct {
			Conversations []conversationListItem `json:"conversations"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		found := 0
		for _, item := range body.Conversations {
			if expected, ok := want[item.ID]; ok {
				found++
				if item.Running != expected || item.Title != "runtime status test" {
					t.Fatalf("conversation %d: running=%v want=%v title=%q", item.ID, item.Running, expected, item.Title)
				}
			}
		}
		if found != len(want) {
			t.Fatalf("found %d of %d conversations", found, len(want))
		}
	}
	check(map[int64]bool{ids[0]: false, ids[1]: false, ids[2]: false})
	s.chatMu.Lock()
	s.chatBusy[s.convBusyKey(ids[1])] = true
	s.chatBusy[s.convBusyKey(ids[2])] = true
	s.chatBusy["unrelated-task"] = true
	s.chatMu.Unlock()
	check(map[int64]bool{ids[0]: false, ids[1]: true, ids[2]: true})
	s.chatMu.Lock()
	clear(s.chatBusy)
	s.chatMu.Unlock()
	check(map[int64]bool{ids[0]: false, ids[1]: false, ids[2]: false})
}

func TestConversationStopBarrier(t *testing.T) {
	s := &Server{chatBusy: map[string]bool{}, chatCancel: map[string]context.CancelCauseFunc{}}
	key := s.convBusyKey(7)
	s.chatMu.Lock()
	if !s.startChatLocked(key) {
		t.Fatal("first run must reserve the conversation")
	}
	if s.startChatLocked(key) {
		t.Fatal("second run must be rejected while the first is active")
	}
	s.chatMu.Unlock()

	time.AfterFunc(20*time.Millisecond, func() { s.finishChat(key) })
	if !s.waitConversationStopped(7, time.Second) {
		t.Fatal("delete barrier must observe the run completion")
	}

	s.chatMu.Lock()
	s.startChatLocked(key)
	s.chatMu.Unlock()
	if s.waitConversationStopped(7, 10*time.Millisecond) {
		t.Fatal("delete barrier must not report idle before the run finishes")
	}
	s.finishChat(key)
}

func TestConversationDeleteAdmissionBlocksNewRuns(t *testing.T) {
	s := &Server{chatBusy: map[string]bool{}, chatCancel: map[string]context.CancelCauseFunc{}}
	key := s.convBusyKey(8)
	s.chatMu.Lock()
	if !s.startChatLocked(key) {
		t.Fatal("initial run must reserve the conversation")
	}
	s.chatMu.Unlock()

	reserved, cancel := s.reserveConversationDelete(8)
	if !reserved {
		t.Fatal("delete must reserve the conversation")
	}
	if cancel != nil {
		cancel(context.Canceled)
	}
	s.finishChat(key)

	s.chatMu.Lock()
	if s.startChatLocked(key) {
		s.chatMu.Unlock()
		t.Fatal("new runs must be rejected while deletion is in progress")
	}
	s.chatMu.Unlock()

	s.finishConversationDelete(8)
	s.chatMu.Lock()
	if !s.startChatLocked(key) {
		s.chatMu.Unlock()
		t.Fatal("conversation must accept a run after deletion admission is released")
	}
	s.chatMu.Unlock()
	s.finishChat(key)
}
