import { createMockEl } from '@test/helpers/MockElement';

import type { ChatMode } from '@/core/types/ChatMode';
import { ChatModeSelector } from '@/features/chat/ui/ChatModeSelector';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  setIcon: jest.fn(),
}));

function setup(initialMode: ChatMode = 'general') {
  const parentEl = createMockEl();
  let mode = initialMode;
  const onChatModeChange = jest.fn(async (next: ChatMode) => {
    mode = next;
  });
  const selector = new ChatModeSelector(parentEl as never, {
    getChatMode: () => mode,
    onChatModeChange,
  });
  const container = parentEl.children[0];
  return { container, onChatModeChange, selector, getMode: () => mode };
}

describe('ChatModeSelector', () => {
  it('renders one segment per mode in display order', () => {
    const { container } = setup();
    expect(container.children).toHaveLength(3);
    expect(container.children.map((c: { dataset: Record<string, string> }) => c.dataset.chatMode))
      .toEqual(['general', 'vault', 'agent']);
  });

  it('marks the current mode active', () => {
    const { container } = setup('vault');
    expect(container.children[0].hasClass('active')).toBe(false);
    expect(container.children[1].hasClass('active')).toBe(true);
    expect(container.children[2].hasClass('active')).toBe(false);
  });

  it('reports the clicked mode', async () => {
    const { container, onChatModeChange } = setup('general');
    container.children[2].click();
    await Promise.resolve();
    expect(onChatModeChange).toHaveBeenCalledWith('agent');
  });

  it('does not fire when the active segment is clicked again', async () => {
    const { container, onChatModeChange } = setup('general');
    container.children[0].click();
    await Promise.resolve();
    expect(onChatModeChange).not.toHaveBeenCalled();
  });

  it('moves the active class after an external mode change', () => {
    const { container, selector, getMode } = setup('general');
    container.children[1].click();
    void getMode();
    selector.updateDisplay();
    expect(container.children[1].hasClass('active')).toBe(true);
  });

  it('exposes the group and segments to assistive tech', () => {
    const { container } = setup();
    expect(container.getAttribute('role')).toBe('group');
    expect(container.children[0].getAttribute('type')).toBe('button');
    expect(container.children[1].getAttribute('aria-pressed')).toBe('false');
  });
});
