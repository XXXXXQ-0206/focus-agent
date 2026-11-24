import type { Activity } from "./types";

function activityId(activity: Activity): string | null {
  const value = activity.seq ?? activity.id;
  return value === undefined || value === null || value === "" ? null : String(value);
}

/** Append incremental activities once, preserving id-less diagnostic records. */
export function appendUniqueActivities(current: Activity[], incoming: Activity[]): Activity[] {
  if (incoming.length === 0) return current;
  const known = new Set(current.map(activityId).filter((id): id is string => id !== null));
  const fresh = incoming.filter((activity) => {
    const id = activityId(activity);
    if (id === null) return true;
    if (known.has(id)) return false;
    known.add(id);
    return true;
  });
  return fresh.length > 0 ? [...current, ...fresh] : current;
}
