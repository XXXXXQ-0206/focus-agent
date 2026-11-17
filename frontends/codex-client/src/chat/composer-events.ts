export const COMPOSER_SET_TEXT_EVENT = "codex:composer-set-text";

export function setComposerText(text: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMPOSER_SET_TEXT_EVENT, { detail: { text } }));
}
