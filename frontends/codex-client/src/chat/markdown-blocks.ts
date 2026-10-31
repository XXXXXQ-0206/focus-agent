export type TableAlignment = "left" | "center" | "right" | null;

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "table"; headers: string[]; align: TableAlignment[]; rows: string[][] }
  | { kind: "hr" };

const FENCE = /^```(.*)$/;
const FENCE_END = /^```\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(---|\*\*\*|___)\s*$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?/;
const TABLE_DELIMITER = /^:?-{3,}:?$/;

function splitTableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  let inCode = false;

  for (const char of line.trim()) {
    if (escaped) {
      if (char === "|" || char === "\\" || char === "`") cell += char;
      else cell += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "`") {
      inCode = !inCode;
      cell += char;
      continue;
    }
    if (char === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());

  const trimmed = line.trim();
  if (trimmed.startsWith("|") && cells[0] === "") cells.shift();
  if (trimmed.endsWith("|") && cells.at(-1) === "") cells.pop();
  return cells;
}

function parseTableAlignment(line: string): TableAlignment[] | null {
  const cells = splitTableCells(line);
  if (cells.length === 0 || !cells.every((cell) => TABLE_DELIMITER.test(cell))) return null;
  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (left) return "left";
    if (right) return "right";
    return null;
  });
}

function parseTable(lines: string[], start: number): { block: MarkdownBlock; next: number } | null {
  if (start + 1 >= lines.length || !lines[start].includes("|")) return null;
  const headers = splitTableCells(lines[start]);
  const align = parseTableAlignment(lines[start + 1]);
  if (!align || headers.length !== align.length) return null;

  const rows: string[][] = [];
  let next = start + 2;
  while (next < lines.length && lines[next].trim() && lines[next].includes("|")) {
    const cells = splitTableCells(lines[next]);
    rows.push(headers.map((_, index) => cells[index] ?? ""));
    next += 1;
  }
  return {
    block: { kind: "table", headers, align, rows },
    next,
  };
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = line.match(FENCE);
    if (fence) {
      const language = fence[1].trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_END.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", language, code: body.join("\n") });
      continue;
    }
    const table = parseTable(lines, i);
    if (table) {
      blocks.push(table.block);
      i = table.next;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }
    const unordered = line.match(UL);
    const ordered = line.match(OL);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const match = isOrdered ? lines[i].match(OL) : lines[i].match(UL);
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(lines[i].replace(QUOTE, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !FENCE.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}
