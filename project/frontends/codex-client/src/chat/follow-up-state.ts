/** Keep a failed queue item intact; remove only the item confirmed as sent. */
export function queueAfterSend<T extends { id: string }>(
  queue: T[],
  sentId: string,
  succeeded: boolean,
): T[] {
  if (!succeeded) return queue;
  return queue[0]?.id === sentId ? queue.slice(1) : queue.filter((item) => item.id !== sentId);
}
