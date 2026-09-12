import type { ProviderCommandDiscoverySource } from '@/core/providers/commands/ProviderCommandDiscoveryStore';
import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { t } from '@/i18n/i18n';
import { normalizeArgumentHint } from '@/utils/slashCommand';

import { groupCommandsByCategory } from './chatModeCommandGroups';

export interface ChatModeCommandPanelOptions {
  /** Null while the tab has no provider catalog bound. */
  readonly getDiscovery: () => ProviderCommandDiscoverySource<ProviderCommandEntry> | null;
  /** Same exclusions the slash dropdown applies, so both pickers agree. */
  readonly getHiddenCommands: () => ReadonlySet<string>;
  readonly onSelect: (command: ProviderCommandEntry) => void;
}

/**
 * Click-to-insert picker for vault commands, opened from the Agent mode segment.
 *
 * It reads the same discovery source as the composer's `/` dropdown, so a
 * command never appears in one picker and not the other. Selecting a command
 * only reports it; the caller decides what to do with the text.
 */
export class ChatModeCommandPanel {
  private readonly anchorEl: HTMLElement;
  private readonly container: HTMLElement;
  private readonly searchEl: HTMLInputElement;
  private readonly resultsEl: HTMLElement;
  private discoveryUnsubscribe: (() => void) | null = null;
  private open_ = false;
  private query = '';

  constructor(
    parentEl: HTMLElement,
    private readonly options: ChatModeCommandPanelOptions,
  ) {
    // The panel owns its own containing block so the shared toolbar keeps its
    // layout and its other dropdowns keep resolving against their own anchors.
    this.anchorEl = parentEl.createDiv({ cls: 'claudian-chat-mode-command-anchor' });
    this.container = this.anchorEl.createDiv({ cls: 'claudian-chat-mode-command-panel' });
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', t('chat.chatMode.commands.label'));
    this.container.hidden = true;

    this.searchEl = this.container.createEl('input', {
      cls: 'claudian-chat-mode-command-search',
      attr: {
        type: 'search',
        'aria-label': t('chat.chatMode.commands.search'),
        placeholder: t('chat.chatMode.commands.search'),
      },
    });
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value;
      this.renderResults();
    });

    this.resultsEl = this.container.createDiv({ cls: 'claudian-chat-mode-command-results' });

    this.container.addEventListener('keydown', event => this.onKeyDown(event));
  }

  get isOpen(): boolean {
    return this.open_;
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.container.hidden = true;
    this.discoveryUnsubscribe?.();
    this.discoveryUnsubscribe = null;
  }

  destroy(): void {
    this.close();
    this.anchorEl.remove();
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    this.container.hidden = false;
    this.query = '';
    this.searchEl.value = '';

    const discovery = this.options.getDiscovery();
    if (discovery) {
      this.discoveryUnsubscribe = discovery.subscribe(() => this.renderResults());
      if (discovery.getSnapshot().status === 'idle') {
        void Promise.resolve().then(() => discovery.load()).catch(() => undefined);
      }
    }
    this.renderResults();
    this.searchEl.focus();
  }

  toggle(): void {
    if (this.open_) {
      this.close();
      return;
    }
    this.open();
  }

  private commandButtons(): HTMLElement[] {
    return [...this.resultsEl.querySelectorAll<HTMLElement>('.claudian-chat-mode-command-item')];
  }

  private matches(entry: ProviderCommandEntry): boolean {
    const query = this.query.trim().toLocaleLowerCase();
    if (!query) return true;
    return entry.name.toLocaleLowerCase().includes(query)
      || (entry.description?.toLocaleLowerCase().includes(query) ?? false);
  }

  private moveFocus(from: HTMLElement | null, delta: number): void {
    const buttons = this.commandButtons();
    if (buttons.length === 0) return;
    const current = from ? buttons.indexOf(from) : -1;
    const next = buttons[Math.min(Math.max(current + delta, 0), buttons.length - 1)];
    next?.focus();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const target = event.target as HTMLElement | null;
    const isCommand = target?.classList.contains('claudian-chat-mode-command-item') ?? false;
    if (event.key === 'ArrowUp' && !isCommand) return;

    event.preventDefault();
    this.moveFocus(isCommand ? target : null, event.key === 'ArrowDown' ? 1 : -1);
  }

  private renderResults(): void {
    if (!this.open_) return;
    this.resultsEl.empty();

    const discovery = this.options.getDiscovery();
    const snapshot = discovery?.getSnapshot() ?? { status: 'empty' as const };

    if (snapshot.status === 'idle' || snapshot.status === 'loading') {
      this.renderStatus(t('chat.chatMode.commands.loading'));
      return;
    }
    if (snapshot.status === 'error') {
      this.renderError(snapshot.message, () => {
        void Promise.resolve().then(() => discovery?.retry()).catch(() => undefined);
      });
      return;
    }
    if (snapshot.status === 'requires-session') {
      this.renderStatus(snapshot.message);
      return;
    }
    if (snapshot.status === 'empty') {
      this.renderStatus(t('chat.chatMode.commands.empty'));
      return;
    }

    const hidden = this.options.getHiddenCommands();
    const visible = snapshot.items.filter(entry => (
      !hidden.has(entry.name.toLocaleLowerCase()) && this.matches(entry)
    ));
    if (visible.length === 0) {
      this.renderStatus(
        this.query.trim()
          ? t('chat.chatMode.commands.noResults')
          : t('chat.chatMode.commands.empty'),
      );
      return;
    }

    const groups = groupCommandsByCategory(visible);
    if (groups.length === 0) {
      // Commands exist but none opted in, so say how rather than look broken.
      this.renderStatus(t('chat.chatMode.commands.needsCategory'));
      return;
    }
    for (const group of groups) {
      this.renderGroup(group.heading, group.commands);
    }
  }

  private renderError(message: string, onRetry: () => void): void {
    const errorEl = this.resultsEl.createDiv({ cls: 'claudian-chat-mode-command-status' });
    errorEl.setAttribute('role', 'alert');
    errorEl.createSpan({ text: message });
    const retryEl = errorEl.createEl('button', {
      cls: 'claudian-chat-mode-command-retry',
      text: t('chat.chatMode.commands.retry'),
      attr: { type: 'button' },
    });
    retryEl.addEventListener('click', onRetry);
  }

  private renderGroup(
    heading: string,
    commands: readonly ProviderCommandEntry[],
  ): void {
    const groupEl = this.resultsEl.createDiv({ cls: 'claudian-chat-mode-command-group' });
    const headingId = `claudian-chat-mode-command-group-${this.resultsEl.childElementCount}`;
    const headingEl = groupEl.createDiv({
      cls: 'claudian-chat-mode-command-group-heading',
      text: heading,
    });
    headingEl.id = headingId;
    const listEl = groupEl.createEl('ul', { cls: 'claudian-chat-mode-command-list' });
    listEl.setAttribute('aria-labelledby', headingId);

    for (const command of commands) {
      const itemEl = listEl.createEl('li').createEl('button', {
        cls: 'claudian-chat-mode-command-item',
        attr: { type: 'button' },
      });
      itemEl.createSpan({
        cls: 'claudian-chat-mode-command-name',
        text: `${command.displayPrefix}${command.name}`,
      });
      const detail = command.argumentHint
        ? `${command.description ?? ''} ${normalizeArgumentHint(command.argumentHint)}`.trim()
        : command.description;
      if (detail) {
        itemEl.createSpan({ cls: 'claudian-chat-mode-command-detail', text: detail });
      }
      itemEl.addEventListener('click', () => {
        this.close();
        this.options.onSelect(command);
      });
    }
  }

  private renderStatus(message: string): void {
    const statusEl = this.resultsEl.createDiv({
      cls: 'claudian-chat-mode-command-status',
      text: message,
    });
    statusEl.setAttribute('role', 'status');
  }
}
