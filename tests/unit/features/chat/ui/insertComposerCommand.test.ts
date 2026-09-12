import { insertComposerCommand } from '@/features/chat/ui/insertComposerCommand';
import type { ComposerInputElement } from '@/shared/composer-dropdown/types';

function nativeInput(value = '', caret = value.length) {
  const focus = jest.fn();
  const el = {
    focus,
    selectionEnd: caret,
    selectionStart: caret,
    value,
  } as unknown as ComposerInputElement;
  return { el, focus };
}

function richInput(value = '', caret = value.length) {
  const focus = jest.fn();
  const state = { value, caret };
  const el = {
    focus,
    replaceText: (from: number, to: number, text: string) => {
      state.value = state.value.slice(0, from) + text + state.value.slice(to);
      state.caret = from + text.length;
    },
    get selectionEnd() { return state.caret; },
    get selectionStart() { return state.caret; },
    get value() { return state.value; },
    set value(next: string) { state.value = next; },
  } as unknown as ComposerInputElement;
  return { el, focus, state };
}

describe('insertComposerCommand', () => {
  it('writes the command and a trailing space into an empty composer', () => {
    const { el } = nativeInput();
    insertComposerCommand(el, '/수집');
    expect(el.value).toBe('/수집 ');
  });

  it('leaves the caret after the trailing space so arguments can be typed', () => {
    const { el } = nativeInput();
    insertComposerCommand(el, '/수집');
    expect(el.selectionStart).toBe('/수집 '.length);
    expect(el.selectionEnd).toBe('/수집 '.length);
  });

  it('focuses the composer so the user can keep typing', () => {
    const { el, focus } = nativeInput();
    insertComposerCommand(el, '/수집');
    expect(focus).toHaveBeenCalled();
  });

  it('inserts at the caret rather than overwriting existing text', () => {
    const { el } = nativeInput('hello world', 5);
    insertComposerCommand(el, '/수집');
    expect(el.value).toBe('hello/수집 world');
  });

  it('replaces the current selection', () => {
    const { el } = nativeInput('draft text');
    el.selectionStart = 0;
    el.selectionEnd = 5;
    insertComposerCommand(el, '/수집');
    expect(el.value).toBe('/수집 text');
  });

  it('uses replaceText when the rich editor provides it', () => {
    const { el, state } = richInput('abc', 1);
    insertComposerCommand(el, '/수집');
    expect(state.value).toBe('a/수집 bc');
    expect(state.caret).toBe(1 + '/수집 '.length);
  });

  it('does not double the separator when a space already follows the caret', () => {
    const { el } = nativeInput(' trailing', 0);
    insertComposerCommand(el, '/수집');
    expect(el.value).toBe('/수집 trailing');
  });
});
