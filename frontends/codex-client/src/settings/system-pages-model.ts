export interface SystemLogLine {
  seq?: number;
  db_id?: number;
  ts: string;
  level: string;
  tag: string;
  text: string;
}

export type SystemLogLevel = "all" | "info" | "warn" | "error";

export function mergeSystemLogs(...groups: readonly SystemLogLine[][]): SystemLogLine[] {
  const unique = new Map<string, SystemLogLine>();
  for (const line of groups.flat()) {
    const key = line.db_id
      ? `db:${String(line.db_id)}`
      : line.seq
        ? `seq:${String(line.seq)}`
        : `${line.ts}:${line.tag}:${line.text}`;
    const current = unique.get(key);
    if (!current || (line.seq ?? 0) > (current.seq ?? 0)) unique.set(key, line);
  }
  return [...unique.values()].sort((left, right) => {
    if (left.seq && right.seq) return left.seq - right.seq;
    if (left.db_id && right.db_id) return left.db_id - right.db_id;
    return left.ts.localeCompare(right.ts);
  });
}

export function filterSystemLogs(
  lines: readonly SystemLogLine[],
  query: string,
  level: SystemLogLevel,
): SystemLogLine[] {
  const needle = query.trim().toLowerCase();
  return lines.filter((line) => {
    if (level !== "all" && line.level !== level) return false;
    if (!needle) return true;
    return `${line.tag} ${line.text}`.toLowerCase().includes(needle);
  });
}
