package db

import "testing"

func TestConversationActivityReadPathsReturnResultDetail(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	conversation, err := d.CreateConversation("auto", "result detail", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(conversation.ID) })

	const (
		summary = "## 中期收束报告"
		detail  = "## 中期收束报告\n\n### 一、已完成的工作\n\n完整正文。"
	)
	activityID, err := d.AppendConvActivity(conversation.ID, Activity{
		Worker:  "auto",
		Kind:    "result",
		Summary: summary,
		Detail:  detail,
	})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("incremental list", func(t *testing.T) {
		items, cursor, err := d.ConvActivityList(conversation.ID, 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		if cursor != activityID {
			t.Fatalf("cursor=%d want=%d", cursor, activityID)
		}
		if len(items) != 1 || items[0].Detail != detail {
			t.Fatalf("result detail=%q want=%q", items[0].Detail, detail)
		}
	})

	t.Run("history page", func(t *testing.T) {
		items, _, err := d.ConvActivityPage(conversation.ID, 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 1 || items[0].Detail != detail {
			t.Fatalf("result detail=%q want=%q", items[0].Detail, detail)
		}
	})
}

func TestConversationActivityReadPathsReturnFullUserDetail(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	conversation, err := d.CreateConversation("auto", "user detail", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(conversation.ID) })

	const (
		summary = "第一行"
		detail  = "第一行\n\n第二段也应该完整显示。\n\n- 第三部分"
	)
	activityID, err := d.AppendConvActivity(conversation.ID, Activity{
		Worker:  "auto",
		Kind:    "user",
		Summary: summary,
		Detail:  detail,
	})
	if err != nil {
		t.Fatal(err)
	}

	t.Run("incremental list", func(t *testing.T) {
		items, cursor, err := d.ConvActivityList(conversation.ID, 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		if cursor != activityID {
			t.Fatalf("cursor=%d want=%d", cursor, activityID)
		}
		if len(items) != 1 || items[0].Detail != detail {
			t.Fatalf("user detail=%q want=%q", items[0].Detail, detail)
		}
	})

	t.Run("history page", func(t *testing.T) {
		items, _, err := d.ConvActivityPage(conversation.ID, 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 1 || items[0].Detail != detail {
			t.Fatalf("user detail=%q want=%q", items[0].Detail, detail)
		}
	})
}
