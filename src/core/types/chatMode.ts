/**
 * Host-owned chat mode. Decides how much of the Vault the agent may touch.
 *
 * Provider backends never see this value; the chat feature projects it into a
 * `ProviderToolPolicy` and `ProviderSystemInstructions` at submission time.
 */
// eslint-disable-next-line local/file-naming -- Brief specifies lowercase chatMode.ts to match siblings
export type ChatMode = 'general' | 'vault' | 'agent';

/** Display order in the composer's mode selector. */
export const CHAT_MODES: readonly ChatMode[] = ['general', 'vault', 'agent'];

/** Used whenever a stored or incoming value cannot be trusted. */
export const FALLBACK_CHAT_MODE: ChatMode = 'general';

/** Settings-level choice: a pinned mode, or "reuse whatever was last picked". */
export type ChatModePreference = ChatMode | 'last-used';

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && (CHAT_MODES as readonly string[]).includes(value);
}

export function normalizeChatMode(
  value: unknown,
  fallback: ChatMode = FALLBACK_CHAT_MODE,
): ChatMode {
  return isChatMode(value) ? value : fallback;
}

/** Resolves the mode a freshly opened tab starts in. */
export function resolveInitialChatMode(preference: unknown, lastUsed: unknown): ChatMode {
  const remembered = normalizeChatMode(lastUsed);
  return preference === 'last-used'
    ? remembered
    : normalizeChatMode(preference, remembered);
}
