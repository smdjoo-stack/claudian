import { readFileSync } from 'node:fs';
import path from 'node:path';

const CSS = readFileSync(
  path.resolve('src/style/toolbar/chat-mode-command-panel.css'),
  'utf8',
);

function ruleBody(selector: string): string {
  const match = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(CSS);
  return match?.[1] ?? '';
}

describe('Chat mode command panel styles', () => {
  // The panel is shown and hidden through `el.hidden`. Any `display` on the
  // class outranks the user-agent `[hidden]` rule, so without an explicit
  // closed state the panel stays on screen after it is closed.
  it('declares a closed state that survives its own display rule', () => {
    expect(ruleBody('.claudian-chat-mode-command-panel')).toMatch(/display:/);
    expect(ruleBody('.claudian-chat-mode-command-panel[hidden]')).toMatch(/display:\s*none/);
  });

  it('anchors the panel to its own containing block rather than the toolbar', () => {
    expect(ruleBody('.claudian-chat-mode-command-anchor')).toMatch(/position:\s*relative/);
    expect(ruleBody('.claudian-chat-mode-command-panel')).toMatch(/position:\s*absolute/);
  });
});
