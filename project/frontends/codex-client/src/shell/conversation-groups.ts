import type { ArtexConversation } from "@/artex/types";

export interface ConversationGroups {
  today: ArtexConversation[];
  earlier: ArtexConversation[];
}

/** Sort once and partition in one pass; normalize timestamps before sorting. */
export function groupConversationsByAge(
  conversations: ArtexConversation[],
  now = Date.now(),
): ConversationGroups {
  const cutoff = now - 24 * 60 * 60 * 1000;
  const timed = conversations.map((conversation) => {
    const timestamp = new Date(conversation.updated_at || conversation.created_at).getTime();
    return { conversation, timestamp: Number.isNaN(timestamp) ? 0 : timestamp };
  });
  timed.sort((left, right) => right.timestamp - left.timestamp);

  const today: ArtexConversation[] = [];
  const earlier: ArtexConversation[] = [];
  for (const item of timed) {
    (item.timestamp >= cutoff ? today : earlier).push(item.conversation);
  }
  return { today, earlier };
}
