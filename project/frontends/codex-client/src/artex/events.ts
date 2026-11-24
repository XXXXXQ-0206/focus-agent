export const ARTexEvents = {
  conversationsChanged: "artex:conversations-changed",
  llmChanged: "artex:llm-changed",
  tasksChanged: "artex:tasks-changed",
} as const;

export function emitArtexEvent(name: (typeof ARTexEvents)[keyof typeof ARTexEvents]): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}
