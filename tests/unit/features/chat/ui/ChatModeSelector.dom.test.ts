/** @jest-environment jsdom */

import { fireEvent, within } from '@testing-library/dom';
import { axe } from 'jest-axe';

import type { ChatMode } from '@/core/types/ChatMode';
import { ChatModeSelector } from '@/features/chat/ui/ChatModeSelector';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  setIcon: jest.fn(),
}));

HTMLElement.prototype.empty = function () { this.replaceChildren(); };
HTMLElement.prototype.addClass = function (...classes) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function (...classes) { this.classList.remove(...classes); };
HTMLElement.prototype.toggleClass = function (classes, enabled) {
  for (const cls of typeof classes === 'string' ? [classes] : classes) {
    this.classList.toggle(cls, enabled);
  }
};

function setup(initialMode: ChatMode = 'general', withPanel = true) {
  document.body.replaceChildren();
  const parentEl = document.body.createDiv();
  let mode = initialMode;
  const onChatModeChange = jest.fn(async (next: ChatMode) => {
    mode = next;
  });
  const panel = {
    close: jest.fn(),
    isOpen: false,
    open: jest.fn(),
    toggle: jest.fn(),
  };
  const selector = new ChatModeSelector(parentEl, {
    getChatMode: () => mode,
    onChatModeChange,
    ...(withPanel ? { commandPanel: panel } : {}),
  });
  const container = parentEl.querySelector<HTMLElement>('.claudian-chat-mode-selector')!;
  return { container, onChatModeChange, panel, selector, getMode: () => mode };
}

describe('ChatModeSelector (DOM semantics)', () => {
  it('exposes all three modes as buttons by their accessible names', () => {
    const { container } = setup();
    expect(within(container).getByRole('button', { name: 'General' })).toBeDefined();
    expect(within(container).getByRole('button', { name: 'Vault' })).toBeDefined();
    expect(within(container).getByRole('button', { name: 'Agent' })).toBeDefined();
  });

  it('marks only the active mode as pressed', () => {
    const { container } = setup('vault');
    expect(within(container).getByRole('button', { name: 'General' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(container).getByRole('button', { name: 'Vault' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(container).getByRole('button', { name: 'Agent' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the clicked mode when a non-active button is clicked', async () => {
    const { container, onChatModeChange } = setup('general');
    fireEvent.click(within(container).getByRole('button', { name: 'Vault' }));
    await Promise.resolve();
    expect(onChatModeChange).toHaveBeenCalledWith('vault');
  });

  it('does not fire when the already-active button is clicked', async () => {
    const { container, onChatModeChange } = setup('general');
    fireEvent.click(within(container).getByRole('button', { name: 'General' }));
    await Promise.resolve();
    expect(onChatModeChange).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    expect((await axe(container)).violations).toEqual([]);
  });

  describe('agent command panel', () => {
    it('opens the panel when switching into Agent mode', async () => {
      const { container, panel } = setup('general');
      fireEvent.click(within(container).getByRole('button', { name: 'Agent' }));
      await Promise.resolve();
      expect(panel.open).toHaveBeenCalledTimes(1);
    });

    it('toggles the panel when Agent is already the active mode', () => {
      const { container, panel } = setup('agent');
      fireEvent.click(within(container).getByRole('button', { name: 'Agent' }));
      expect(panel.toggle).toHaveBeenCalledTimes(1);
    });

    it('does not open the panel for General or Vault', async () => {
      const { container, panel } = setup('agent');
      fireEvent.click(within(container).getByRole('button', { name: 'Vault' }));
      await Promise.resolve();
      expect(panel.open).not.toHaveBeenCalled();
      expect(panel.toggle).not.toHaveBeenCalled();
    });

    it('closes the panel when leaving Agent mode', async () => {
      const { container, panel } = setup('agent');
      fireEvent.click(within(container).getByRole('button', { name: 'General' }));
      await Promise.resolve();
      expect(panel.close).toHaveBeenCalled();
    });

    it('marks only the Agent segment as owning a popup', () => {
      const { container } = setup('agent');
      expect(within(container).getByRole('button', { name: 'Agent' }).getAttribute('aria-haspopup')).toBe('true');
      expect(within(container).getByRole('button', { name: 'Vault' }).getAttribute('aria-haspopup')).toBeNull();
    });

    it('still switches modes when no panel is wired', async () => {
      const { container, onChatModeChange } = setup('general', false);
      fireEvent.click(within(container).getByRole('button', { name: 'Agent' }));
      await Promise.resolve();
      expect(onChatModeChange).toHaveBeenCalledWith('agent');
    });
  });
});
