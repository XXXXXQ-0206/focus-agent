export interface SseMessage {
  data: string;
  lastEventId: string;
}

export interface TicketedEventSource {
  onmessage: ((event: SseMessage) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface TicketedEventStreamOptions {
  taskId: string;
  initialSince?: string;
  endpoint: string;
  issueTicket: () => Promise<string>;
  createSource: (url: string) => TicketedEventSource;
  onMessage: (event: SseMessage) => void;
  onError?: (error?: unknown) => void;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function connectTicketedEventStream(options: TicketedEventStreamOptions): Promise<() => void> {
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  let source: TicketedEventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEventId = options.initialSince ?? "";
  let retryAttempt = 0;
  let connecting = false;
  let closed = false;
  let initialConnection = true;

  const scheduleReconnect = () => {
    if (closed || retryTimer !== undefined) return;
    const delay = Math.min(10_000, 500 * 2 ** retryAttempt);
    retryAttempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = undefined;
      void connect();
    }, delay);
  };

  const connect = async (): Promise<void> => {
    if (closed || connecting) return;
    connecting = true;
    try {
      const ticket = await options.issueTicket();
      if (closed) return;
      const url = new URL(options.endpoint);
      url.searchParams.set("task", options.taskId);
      url.searchParams.set("ticket", ticket);
      if (lastEventId) url.searchParams.set("since", lastEventId);
      const nextSource = options.createSource(url.toString());
      source = nextSource;
      nextSource.onmessage = (event) => {
        if (closed || source !== nextSource) return;
        if (event.lastEventId) lastEventId = event.lastEventId;
        retryAttempt = 0;
        options.onMessage(event);
      };
      nextSource.onerror = () => {
        if (closed || source !== nextSource) return;
        nextSource.close();
        source = null;
        options.onError?.();
        scheduleReconnect();
      };
    } catch (error) {
      if (initialConnection) {
        initialConnection = false;
        throw error;
      }
      if (!closed) {
        options.onError?.(error);
        scheduleReconnect();
      }
    } finally {
      connecting = false;
      initialConnection = false;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (retryTimer !== undefined) clearTimer(retryTimer);
    retryTimer = undefined;
    source?.close();
    source = null;
  };

  return connect().then(() => close);
}
