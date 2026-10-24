/** Composer 可发送条件：文本或附件至少有一项。 */
export function hasComposerContent(text: string, attachmentCount = 0): boolean {
  return text.trim().length > 0 || attachmentCount > 0;
}
