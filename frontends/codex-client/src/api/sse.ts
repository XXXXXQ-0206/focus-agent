/**
 * SSE（`text/event-stream`）增量解码器。
 *
 * ★ 这是整个客户端最容易写错的地方，所以单独成文件、单独测：
 *   网络分块与 SSE 行边界**没有任何关系**。一次 `read()` 可能拿到：
 *     · 半行           → `data: {"cho`
 *     · 半条事件（行完整但 JSON 没闭合）
 *     · 恰好以 \r 结尾 → 下一块以 \n 开头才是 CRLF，也可能下一块是别的字符
 *     · 多条事件 + 半条
 *   因此解析必须**先按行缓冲，行完整了才解析 data 字段**，绝不能在 chunk 上直接 JSON.parse。
 *
 * 兼容性（超出规范的宽容处理，都是实测会遇到的形态）：
 *   · 行结束符支持 \n / \r\n / 单个 \r（规范三种都允许），且跨分块处理 \r|\n；
 *   · 字段名大小写不敏感（部分国产兼容服务发 `Data:`）；
 *   · `:comment` 行（心跳）忽略；
 *   · 流结束时若最后一条事件没有空行收尾，`flush()` 仍把它吐出来（官方 OpenAI 有收尾空行）。
 */

export interface SseEvent {
  /** 没有 `event:` 字段时为 null */
  event: string | null;
  /** 多行 `data:` 按规范用 \n 连接后的完整载荷 */
  data: string;
  id: string | null;
  retry: number | null;
}

export interface SseDecoder {
  /** 喂一个文本分块，返回**已经完整**的事件（可能 0..n 条） */
  push(chunk: string): SseEvent[];
  /** 流结束收尾：吐出未闭合的最后一行 / 最后一条事件 */
  flush(): SseEvent[];
  /** 当前还没凑成完整行的字符数（调试用） */
  readonly pending: number;
  reset(): void;
}

export function createSseDecoder(): SseDecoder {
  let lineBuffer = "";
  /** 上一块以 \r 结尾，等下一块确认它是 CRLF 还是孤立 CR */
  let pendingCR = false;
  let dataLines: string[] = [];
  let eventName: string | null = null;
  let lastId: string | null = null;
  let retry: number | null = null;
  let sawData = false;

  function resetEventFields() {
    dataLines = [];
    eventName = null;
    retry = null;
    sawData = false;
  }

  function dispatch(out: SseEvent[]) {
    if (!sawData) {
      // 只有 event:/id: 没有 data: → 规范要求不派发
      resetEventFields();
      return;
    }
    out.push({ event: eventName, data: dataLines.join("\n"), id: lastId, retry });
    resetEventFields();
  }

  function consumeLine(line: string, out: SseEvent[]) {
    if (line === "") {
      dispatch(out);
      return;
    }
    if (line.startsWith(":")) return; // 注释 / 心跳

    const colon = line.indexOf(":");
    const rawField = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    const field = rawField.toLowerCase();

    if (field === "data") {
      dataLines.push(value);
      sawData = true;
      return;
    }
    if (field === "event") {
      eventName = value;
      return;
    }
    if (field === "id") {
      if (!value.includes("\u0000")) lastId = value;
      return;
    }
    if (field === "retry") {
      if (/^\d+$/.test(value)) retry = Number(value);
      return;
    }
    // 未知字段按规范忽略
  }

  return {
    get pending() {
      return lineBuffer.length + (pendingCR ? 1 : 0);
    },

    reset() {
      lineBuffer = "";
      pendingCR = false;
      resetEventFields();
    },

    push(chunk: string) {
      const out: SseEvent[] = [];
      let rest = chunk;

      // 上一块留了个 \r：先确认它是「孤立 CR」还是「CRLF 的前半」
      if (pendingCR) {
        pendingCR = false;
        if (rest.startsWith("\n")) rest = rest.slice(1);
        consumeLine(lineBuffer, out);
        lineBuffer = "";
      }

      while (rest.length > 0) {
        const nl = rest.indexOf("\n");
        const cr = rest.indexOf("\r");

        if (nl === -1 && cr === -1) {
          lineBuffer += rest;
          return out;
        }

        if (cr !== -1 && (nl === -1 || cr < nl)) {
          lineBuffer += rest.slice(0, cr);
          if (cr === rest.length - 1) {
            // 本块以 \r 结束，把判定推迟到下一块
            pendingCR = true;
            return out;
          }
          rest = rest[cr + 1] === "\n" ? rest.slice(cr + 2) : rest.slice(cr + 1);
          consumeLine(lineBuffer, out);
          lineBuffer = "";
          continue;
        }

        lineBuffer += rest.slice(0, nl);
        rest = rest.slice(nl + 1);
        consumeLine(lineBuffer, out);
        lineBuffer = "";
      }
      return out;
    },

    flush() {
      const out: SseEvent[] = [];
      if (pendingCR) {
        pendingCR = false;
        consumeLine(lineBuffer, out);
        lineBuffer = "";
      }
      if (lineBuffer.length > 0) {
        consumeLine(lineBuffer, out);
        lineBuffer = "";
      }
      // 容忍「最后一条事件没有空行」的服务端
      if (sawData) dispatch(out);
      return out;
    },
  };
}

/** 把 SSE 事件还原成「一行」调试文本（错误提示里用，超长截断） */
export function describeSseEvent(event: SseEvent, maxLength = 120): string {
  const text = event.data.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
