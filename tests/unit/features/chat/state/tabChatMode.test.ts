import type { ChatMode } from '@/core/types/ChatMode';
import { getTabChatMode, setTabChatMode } from '@/features/chat/state/tabChatMode';

function makeTab(chatMode: ChatMode) {
  return { chatMode } as { chatMode: ChatMode };
}

function makePlugin(lastUsedChatMode: ChatMode = 'general') {
  const settings = { defaultChatMode: 'last-used', lastUsedChatMode };
  return {
    settings,
    mutateSettings: jest.fn(async (mutate: (s: typeof settings) => void) => {
      mutate(settings);
    }),
  };
}

describe('getTabChatMode', () => {
  it('reads the tab field', () => {
    expect(getTabChatMode(makeTab('vault') as never)).toBe('vault');
  });

  it('falls back when the tab holds a bad value', () => {
    expect(getTabChatMode({ chatMode: 'nonsense' } as never)).toBe('general');
  });
});

describe('setTabChatMode', () => {
  it('writes the tab field', async () => {
    const tab = makeTab('general');
    const plugin = makePlugin();
    await setTabChatMode(tab as never, plugin as never, 'agent');
    expect(tab.chatMode).toBe('agent');
  });

  it('remembers the mode globally so new tabs inherit it', async () => {
    const plugin = makePlugin();
    await setTabChatMode(makeTab('general') as never, plugin as never, 'vault');
    expect(plugin.mutateSettings).toHaveBeenCalledTimes(1);
    expect(plugin.settings.lastUsedChatMode).toBe('vault');
  });

  it('does not persist when the mode did not change', async () => {
    const plugin = makePlugin('vault');
    await setTabChatMode(makeTab('vault') as never, plugin as never, 'vault');
    expect(plugin.mutateSettings).not.toHaveBeenCalled();
  });
});
