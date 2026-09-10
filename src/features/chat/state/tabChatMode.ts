import type { ChatMode } from '@/core/types/ChatMode';
import { normalizeChatMode } from '@/core/types/ChatMode';
import type { FeatureHost } from '@/features/FeatureHost';

import type { AssembledTabRuntime, TabProviderContext } from '../tabs/types';

/** Reads the tab's mode, tolerating a corrupted value. */
export function getTabChatMode(tab: Pick<TabProviderContext, 'chatMode'>): ChatMode {
  return normalizeChatMode(tab.chatMode);
}

/**
 * Sets the tab's mode and remembers it globally so new tabs inherit it.
 *
 * The tab field is authoritative for this tab; `lastUsedChatMode` only seeds
 * tabs opened later. Skips the settings write when nothing changed.
 */
export async function setTabChatMode(
  tab: Pick<AssembledTabRuntime, 'chatMode'>,
  plugin: FeatureHost,
  mode: ChatMode,
): Promise<void> {
  const next = normalizeChatMode(mode);
  const previous = normalizeChatMode(tab.chatMode);
  tab.chatMode = next;
  if (previous === next && normalizeChatMode(plugin.settings.lastUsedChatMode) === next) {
    return;
  }
  try {
    await plugin.mutateSettings((settings) => {
      settings.lastUsedChatMode = next;
    });
  } catch (error) {
    // Keep the tab's reported mode consistent with the failure the caller sees:
    // if the settings write did not take, the tab did not really switch either.
    tab.chatMode = previous;
    throw error;
  }
}
