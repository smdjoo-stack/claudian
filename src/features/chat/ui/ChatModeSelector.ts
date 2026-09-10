import { Notice } from 'obsidian';

import type { ChatMode } from '@/core/types/ChatMode';
import { CHAT_MODES } from '@/core/types/ChatMode';
import { t } from '@/i18n/i18n';

export interface ChatModeSelectorCallbacks {
  getChatMode: () => ChatMode;
  onChatModeChange: (mode: ChatMode) => Promise<void>;
}

/**
 * Three-way segmented control for the host-owned chat mode.
 *
 * Host-owned on purpose: the mode is projected into a provider-neutral tool
 * policy, so it must not live in the provider-supplied `ModeSelector` slot
 * (which is also two-option only).
 */
export class ChatModeSelector {
  private readonly container: HTMLElement;
  private readonly segmentEls = new Map<ChatMode, HTMLElement>();

  constructor(
    parentEl: HTMLElement,
    private readonly callbacks: ChatModeSelectorCallbacks,
  ) {
    this.container = parentEl.createDiv({ cls: 'claudian-chat-mode-selector' });
    this.render();
  }

  private render(): void {
    this.container.empty();
    this.segmentEls.clear();
    this.container.setAttribute('role', 'radiogroup');
    this.container.setAttribute('aria-label', t('chat.chatMode.label'));

    for (const mode of CHAT_MODES) {
      const segmentEl = this.container.createDiv({
        cls: 'claudian-chat-mode-segment',
        text: t(`chat.chatMode.${mode}`),
      });
      segmentEl.dataset.chatMode = mode;
      segmentEl.setAttribute('role', 'radio');
      segmentEl.setAttribute('tabindex', '0');
      segmentEl.setAttribute('title', t(`chat.chatMode.${mode}Desc`));
      segmentEl.addEventListener('click', () => {
        this.select(mode);
      });
      segmentEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.select(mode);
      });
      this.segmentEls.set(mode, segmentEl);
    }

    this.updateDisplay();
  }

  updateDisplay(): void {
    const current = this.callbacks.getChatMode();
    for (const [mode, segmentEl] of this.segmentEls) {
      const isActive = mode === current;
      segmentEl.toggleClass('active', isActive);
      segmentEl.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
  }

  private select(mode: ChatMode): void {
    if (mode === this.callbacks.getChatMode()) return;
    void this.callbacks.onChatModeChange(mode)
      .then(() => {
        this.updateDisplay();
      })
      .catch(() => {
        new Notice(t('chat.chatMode.label'));
        this.updateDisplay();
      });
  }
}
