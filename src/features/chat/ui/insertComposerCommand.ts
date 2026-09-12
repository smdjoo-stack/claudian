import type { ComposerInputElement } from '@/shared/composer-dropdown/types';

/**
 * Inserts `text` plus one separating space at the composer caret and focuses it.
 *
 * The trailing space is what lets the user type arguments straight away, and it
 * is skipped when the caret already sits in front of whitespace so picking a
 * command never leaves a double space behind. Mirrors the trailing-space
 * handling in `ComposerDropdownController.replaceRange`.
 */
export function insertComposerCommand(inputEl: ComposerInputElement, text: string): void {
  const value = inputEl.value;
  const start = inputEl.selectionStart ?? value.length;
  const end = inputEl.selectionEnd ?? start;
  const insert = /^\s/.test(value.slice(end)) ? text : `${text} `;

  if (inputEl.replaceText) {
    inputEl.replaceText(start, end, insert);
  } else {
    inputEl.value = value.slice(0, start) + insert + value.slice(end);
    const caret = start + insert.length;
    inputEl.selectionStart = caret;
    inputEl.selectionEnd = caret;
  }
  inputEl.focus();
}
