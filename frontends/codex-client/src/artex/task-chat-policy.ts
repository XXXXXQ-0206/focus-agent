/** 历史任务会话只读；主会话队列仍可在后台投递到 main。 */
export function canSendTaskMessage(activitySession: string, fromQueue = false): boolean {
  return fromQueue || activitySession === "main";
}

export function taskComposerReadOnly(activitySession: string): boolean {
  return activitySession !== "main";
}
