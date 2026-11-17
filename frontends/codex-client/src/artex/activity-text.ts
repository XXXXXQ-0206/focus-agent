import type { Activity } from "./types";

export function activityText(activity: Activity): string {
  return (
    activity.summary ||
    activity.message ||
    activity.content ||
    activity.text ||
    activity.detail ||
    "Focus 活动已更新"
  );
}

/**
 * User records are previewed in Summary and stored in Detail. Always prefer the
 * complete Detail so multiline messages do not collapse to their title line.
 */
export function userActivityText(activity: Activity): string {
  if (typeof activity.detail === "string" && activity.detail.trim()) {
    if (activity.detail.trim().startsWith("{")) {
      try {
        const detail = JSON.parse(activity.detail) as { text?: unknown };
        if (typeof detail.text === "string") return detail.text;
      } catch {
        // Older/non-JSON details remain usable as plain text below.
      }
    }
    return activity.detail;
  }
  return activity.summary || activity.message || activity.content || activity.text || "";
}
