import assert from "node:assert/strict";
import test from "node:test";
import { connectTicketedEventStream } from "../src/artex/sse.ts";

type Listener<T> = ((event: T) => void) | null;

class FakeEventSource {
  onmessage: Listener<{ data: string; lastEventId: string }> = null;
  onerror: Listener<unknown> = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  close() {
    this.closed = true;
  }
}

function createHarness(issueTicket: () => Promise<string>) {
  const sources: FakeEventSource[] = [];
  const timers: Array<() => void> = [];
  const stream = connectTicketedEventStream({
    taskId: "task /1",
    endpoint: "http://127.0.0.1:8787/api/exploration/activity/stream",
    issueTicket,
    createSource: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
    onMessage: () => undefined,
    setTimer: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  return { stream, sources, timers };
}

test("reconnect obtains a fresh ticket and resumes after the last event", async () => {
  let ticketNumber = 0;
  const harness = createHarness(async () => `ticket-${++ticketNumber}`);
  const close = await harness.stream;

  assert.match(harness.sources[0]!.url, /task=task\+%2F1/);
  assert.match(harness.sources[0]!.url, /ticket=ticket-1/);
  harness.sources[0]!.onmessage?.({ data: "first", lastEventId: "42" });
  harness.sources[0]!.onerror?.(new Event("error"));
  assert.equal(harness.sources[0]!.closed, true);

  harness.timers.shift()!();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ticketNumber, 2);
  assert.match(harness.sources[1]!.url, /ticket=ticket-2/);
  assert.match(harness.sources[1]!.url, /since=42/);
  close();
});

test("closing the stream prevents a scheduled reconnect", async () => {
  let ticketNumber = 0;
  const harness = createHarness(async () => `ticket-${++ticketNumber}`);
  const close = await harness.stream;

  harness.sources[0]!.onerror?.(new Event("error"));
  close();
  harness.timers.shift()!();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ticketNumber, 1);
  assert.equal(harness.sources[0]!.closed, true);
});
