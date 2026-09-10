import { getCustomInstructions, getUserMessageContext } from './mainAgent';

export interface GeneralChatPromptSettings {
  customPrompt?: string;
  userName?: string;
}

function getGeneralChatRuntimeContext(userName: string | undefined): string {
  const trimmedUserName = userName?.trim();
  const addressee = trimmedUserName ? `**${trimmedUserName}**` : 'the user';

  return `## Runtime Context

You are Claudian, talking with ${addressee} inside Obsidian. This conversation runs in General mode: you have no tools and no access to the Vault's files.

- Answer from your own knowledge and from whatever context the user attached to the message.
- Never claim to have read, searched, or listed a Vault file, and never cite a Vault path that was not given to you.
- When the answer needs Vault content the user did not attach, say so and tell them to switch to Vault mode or attach the note with \`@\`.
- You cannot run shell commands. Never state the current date or time as fact unless the user provided it.`;
}

/**
 * System prompt for General mode.
 *
 * Deliberately omits the Vault sections of `buildSystemPrompt` (path
 * conventions, file operations, reference conventions, media folder, Vault
 * path). Attached context still reaches the model through the prompt encoder,
 * so the user-message context section is retained.
 */
export function buildGeneralChatSystemPrompt(
  settings: GeneralChatPromptSettings = {},
): string {
  return [
    getGeneralChatRuntimeContext(settings.userName),
    getUserMessageContext(),
    getCustomInstructions(settings.customPrompt),
  ].filter(Boolean).join('\n\n');
}
