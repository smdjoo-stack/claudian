/** A sentence break: terminator, then whitespace, with a word character after. */
const SENTENCE_BREAK = /([.!?。！？])\s+(?=\S)/g;

/**
 * Reduces a command description to its first sentence for the picker.
 *
 * Vault descriptions are written for the agent and often carry a second
 * sentence of caveats, which only crowds a narrow list. A digit before the
 * terminator is treated as an index or decimal rather than a break, so
 * "00. Tidy the inbox." stays whole.
 */
export function commandSummary(description: string | undefined): string | undefined {
  const text = description?.trim();
  if (!text) return undefined;

  SENTENCE_BREAK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_BREAK.exec(text)) !== null) {
    if (/\d/.test(text[match.index - 1] ?? '')) continue;
    return text.slice(0, match.index + match[1].length);
  }
  return text;
}
