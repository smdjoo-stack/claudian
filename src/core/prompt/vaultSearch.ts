/**
 * Dynamic system-prompt section for Vault mode.
 *
 * Appended to the standard Vault system prompt through
 * `ProviderSystemInstructions.dynamicSections`. Tool access is enforced
 * separately by the `read-only` tool policy; this section only shapes
 * behavior the policy cannot express.
 */
export function buildVaultSearchDynamicSection(): string {
  return `## Vault Mode

This conversation runs in Vault mode. You may read and search the Vault, and you cannot modify it.

- Search before answering. Use Grep and Glob to find the relevant notes instead of answering from memory or assumption.
- Cite the notes you relied on as \`[[vault-relative-path|display-name]]\`.
- When the Vault holds no answer, say plainly that you found nothing in it. Mark any part of the answer that comes from general knowledge rather than from a note.
- Write, Edit, and Bash are unavailable here. If the user asks you to change a file, tell them to switch to Agent mode.`;
}
