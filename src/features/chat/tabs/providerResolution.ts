import { getEnabledProviderForModel } from '../../../core/providers/modelRouting';
import type { ProviderId } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import type { FeatureHost } from '../../FeatureHost';
import type { TabProviderContext } from './types';

/** Only the fields this module actually reads, so callers holding a narrower tab projection still satisfy it. */
type TabProviderIdSource = Pick<TabProviderContext, 'conversationId' | 'draftModel' | 'providerId'>;

function getStoredConversationProviderId(
  tab: TabProviderIdSource,
  plugin: FeatureHost,
): ProviderId {
  if (tab.conversationId) {
    const conversation = plugin.getConversationSync(tab.conversationId);
    if (conversation?.providerId) {
      return conversation.providerId;
    }
  }

  if (tab.conversationId === null && tab.draftModel) {
    return getEnabledProviderForModel(
      tab.draftModel,
      plugin.settings,
    );
  }

  return tab.providerId;
}

export function getTabProviderId(
  tab: TabProviderIdSource,
  plugin: FeatureHost,
  conversation?: Conversation | null,
): ProviderId {
  return conversation?.providerId ?? getStoredConversationProviderId(tab, plugin);
}
