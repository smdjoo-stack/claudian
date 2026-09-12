import { Notice } from 'obsidian';

import type { ChatMode } from '@/core/types/ChatMode';
import { CHAT_MODES } from '@/core/types/ChatMode';
import { t } from '@/i18n/i18n';

/** The part of the command panel the selector drives. */
export interface ChatModeCommandPanelHandle {
  readonly isOpen: boolean;
  close(): void;
  open(): void;
  toggle(): void;
}

export interface ChatModeSelectorCallbacks {
  /** Optional: without it the Agent segment only switches modes. */
  commandPanel?: ChatModeCommandPanelHandle;
  getChatMode: () => ChatMode;
  onChatModeChange: (mode: ChatMode) => Promise<void>;
}

/** Agent is the only mode whose segment also opens a command picker. */
const PANEL_MODE: ChatMode = 'agent';

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

  updateDisplay(): void {
    const current = this.callbacks.getChatMode();
    for (const [mode, segmentEl] of this.segmentEls) {
      const isActive = mode === current;
      segmentEl.toggleClass('active', isActive);
      segmentEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  private render(): void {
    this.container.empty();
    this.segmentEls.clear();
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', t('chat.chatMode.label'));

    const panel = this.callbacks.commandPanel;
    for (const mode of CHAT_MODES) {
      const segmentEl = this.container.createEl('button', {
        cls: 'claudian-chat-mode-segment',
        text: t(`chat.chatMode.${mode}`),
        attr: { type: 'button' },
      });
      segmentEl.dataset.chatMode = mode;
      segmentEl.setAttribute('title', t(`chat.chatMode.${mode}Desc`));
      if (panel && mode === PANEL_MODE) {
        segmentEl.addClass('claudian-chat-mode-segment--has-panel');
        segmentEl.setAttribute('aria-haspopup', 'true');
      }
      segmentEl.addEventListener('click', () => {
        this.select(mode);
      });
      this.segmentEls.set(mode, segmentEl);
    }

    this.updateDisplay();
  }

  private select(mode: ChatMode): void {
    const panel = this.callbacks.commandPanel;
    if (mode === this.callbacks.getChatMode()) {
      // Re-clicking the active Agent segment is the only way to reopen the
      // picker, so it toggles instead of being ignored as a no-op switch.
      if (mode === PANEL_MODE) panel?.toggle();
      return;
    }

    panel?.close();
    void this.callbacks.onChatModeChange(mode)
      .then(() => {
        this.updateDisplay();
        if (mode === PANEL_MODE) panel?.open();
      })
      .catch(() => {
        new Notice(t('chat.chatMode.changeFailed'));
        this.updateDisplay();
      });
  }
}
