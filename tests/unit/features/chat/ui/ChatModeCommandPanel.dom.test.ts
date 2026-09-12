/** @jest-environment jsdom */

import { fireEvent, within } from '@testing-library/dom';
import { axe } from 'jest-axe';

import type { ProviderCommandDiscoverySnapshot } from '@/core/providers/commands/ProviderCommandDiscoveryStore';
import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { ChatModeCommandPanel } from '@/features/chat/ui/ChatModeCommandPanel';

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

function entry(name: string, category?: string, description?: string): ProviderCommandEntry {
  return {
    id: `cmd-${name}`,
    providerId: 'claude',
    kind: 'command',
    name,
    category,
    description,
    content: '',
    scope: 'vault',
    source: 'user',
    isEditable: true,
    isDeletable: true,
    displayPrefix: '/',
    insertPrefix: '/',
  };
}

const VAULT_COMMANDS = [
  entry('수집', '1. 수집 · 위키 만들기', 'Collect the inbox into the wiki'),
  entry('위키', '1. 수집 · 위키 만들기', 'Wiki a chosen folder'),
  entry('주석', '2. 설교 준비 흐름', 'Research the passage'),
  entry('상태', '3. 조회 (읽기 전용)', 'Report vault status'),
];

function setup(options: {
  snapshot?: ProviderCommandDiscoverySnapshot<ProviderCommandEntry>;
  hidden?: ReadonlySet<string>;
} = {}) {
  document.body.replaceChildren();
  const parentEl = document.body.createDiv();
  const load = jest.fn(async () => ({ status: 'empty' }) as const);
  const retry = jest.fn(async () => ({ status: 'empty' }) as const);
  let listener: (() => void) | null = null;
  let snapshot: ProviderCommandDiscoverySnapshot<ProviderCommandEntry> =
    options.snapshot ?? { status: 'ready', items: [VAULT_COMMANDS[0], ...VAULT_COMMANDS.slice(1)] };

  const onSelect = jest.fn();
  const panel = new ChatModeCommandPanel(parentEl, {
    getDiscovery: () => ({
      getSnapshot: () => snapshot,
      load,
      retry,
      subscribe: (next: () => void) => {
        listener = next;
        return () => { listener = null; };
      },
    }),
    getHiddenCommands: () => options.hidden ?? new Set<string>(),
    onSelect,
  });

  const container = parentEl.querySelector<HTMLElement>('.claudian-chat-mode-command-panel')!;
  return {
    container,
    load,
    onSelect,
    panel,
    retry,
    publish(next: ProviderCommandDiscoverySnapshot<ProviderCommandEntry>) {
      snapshot = next;
      listener?.();
    },
  };
}

describe('ChatModeCommandPanel', () => {
  describe('open and close', () => {
    it('stays hidden until it is opened', () => {
      const { container } = setup();
      expect(container.hidden).toBe(true);
    });

    it('shows the vault commands once opened', () => {
      const { container, panel } = setup();
      panel.open();
      expect(within(container).getByRole('button', { name: /\/수집/ })).toBeDefined();
      expect(within(container).getByRole('button', { name: /\/상태/ })).toBeDefined();
    });

    it('toggles closed when toggle is called twice', () => {
      const { container, panel } = setup();
      panel.toggle();
      expect(container.hidden).toBe(false);
      panel.toggle();
      expect(container.hidden).toBe(true);
    });

    it('closes on Escape', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.keyDown(container, { key: 'Escape' });
      expect(container.hidden).toBe(true);
    });
  });

  describe('grouping', () => {
    it('renders each category heading in its declared order', () => {
      const { container, panel } = setup();
      panel.open();
      const headings = [...container.querySelectorAll('.claudian-chat-mode-command-group-heading')]
        .map(el => el.textContent);
      expect(headings).toEqual(['수집 · 위키 만들기', '설교 준비 흐름', '조회 (읽기 전용)']);
    });
  });

  describe('selection', () => {
    it('reports the selected command instead of sending it', () => {
      const { container, onSelect, panel } = setup();
      panel.open();
      fireEvent.click(within(container).getByRole('button', { name: /\/수집/ }));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0][0].name).toBe('수집');
    });

    it('closes after a command is selected', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.click(within(container).getByRole('button', { name: /\/수집/ }));
      expect(container.hidden).toBe(true);
    });
  });

  describe('search', () => {
    it('keeps only commands matching the query', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.input(within(container).getByRole('searchbox'), { target: { value: '수집' } });
      expect(within(container).getByRole('button', { name: /\/수집/ })).toBeDefined();
      expect(within(container).queryByRole('button', { name: /\/상태/ })).toBeNull();
    });

    it('matches on the description as well as the name', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.input(within(container).getByRole('searchbox'), { target: { value: 'passage' } });
      expect(within(container).getByRole('button', { name: /\/주석/ })).toBeDefined();
      expect(within(container).queryByRole('button', { name: /\/수집/ })).toBeNull();
    });

    it('reports when the query matches nothing', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.input(within(container).getByRole('searchbox'), { target: { value: 'zzzz' } });
      expect(within(container).getByRole('status').textContent).toBeTruthy();
      expect(within(container).queryByRole('button', { name: /^\// })).toBeNull();
    });

    it('clears the query when reopened so the full list returns', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.input(within(container).getByRole('searchbox'), { target: { value: '수집' } });
      panel.close();
      panel.open();
      expect(within(container).getByRole('button', { name: /\/상태/ })).toBeDefined();
    });
  });

  describe('hidden commands', () => {
    it('omits commands hidden from the slash dropdown', () => {
      const { container, panel } = setup({ hidden: new Set(['상태']) });
      panel.open();
      expect(within(container).queryByRole('button', { name: /\/상태/ })).toBeNull();
      expect(within(container).getByRole('button', { name: /\/수집/ })).toBeDefined();
    });
  });

  describe('discovery states', () => {
    it('starts discovery and reports loading when the catalog is idle', async () => {
      const { container, load, panel } = setup({ snapshot: { status: 'idle' } });
      panel.open();
      await Promise.resolve();
      expect(load).toHaveBeenCalledTimes(1);
      expect(within(container).getByRole('status').textContent).toBeTruthy();
    });

    it('renders commands as soon as discovery publishes them', () => {
      const { container, panel, publish } = setup({ snapshot: { status: 'loading' } });
      panel.open();
      expect(within(container).queryByRole('button', { name: /\/수집/ })).toBeNull();
      publish({ status: 'ready', items: [VAULT_COMMANDS[0], ...VAULT_COMMANDS.slice(1)] });
      expect(within(container).getByRole('button', { name: /\/수집/ })).toBeDefined();
    });

    it('reports an empty catalog', () => {
      const { container, panel } = setup({ snapshot: { status: 'empty' } });
      panel.open();
      expect(within(container).getByRole('status').textContent).toBeTruthy();
    });

    it('offers a retry when discovery failed', async () => {
      const { container, panel, retry } = setup({
        snapshot: { status: 'error', message: 'Discovery blew up', retryable: true },
      });
      panel.open();
      expect(within(container).getByRole('alert').textContent).toContain('Discovery blew up');
      fireEvent.click(within(container).getByRole('button', { name: /retry/i }));
      await Promise.resolve();
      expect(retry).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard navigation', () => {
    it('moves focus to the first command on ArrowDown from the search box', () => {
      const { container, panel } = setup();
      panel.open();
      fireEvent.keyDown(within(container).getByRole('searchbox'), { key: 'ArrowDown' });
      expect(document.activeElement).toBe(within(container).getByRole('button', { name: /\/수집/ }));
    });

    it('moves between commands with ArrowDown and ArrowUp', () => {
      const { container, panel } = setup();
      panel.open();
      const first = within(container).getByRole('button', { name: /\/수집/ });
      const second = within(container).getByRole('button', { name: /\/위키/ });
      first.focus();
      fireEvent.keyDown(first, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(second);
      fireEvent.keyDown(second, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(first);
    });
  });

  describe('accessibility', () => {
    it('has no detectable violations when open', async () => {
      const { container, panel } = setup();
      panel.open();
      expect(await axe(container)).toHaveNoViolations();
    });

    it('stops listening to discovery once destroyed', () => {
      const { panel, publish } = setup();
      panel.open();
      panel.destroy();
      expect(() => publish({ status: 'empty' })).not.toThrow();
    });
  });
});
