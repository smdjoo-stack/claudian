import type {
  ProviderSystemInstructions,
  ProviderToolPolicy,
} from '@/core/execution';
import { buildGeneralChatSystemPrompt } from '@/core/prompt/generalChat';
import { buildVaultSearchDynamicSection } from '@/core/prompt/vaultSearch';
import type { ChatMode } from '@/core/types/ChatMode';

export interface ChatModeProjectionInput {
  /** Instruction-mode and other host-supplied prompt sections. */
  dynamicSections?: readonly string[];
  customPrompt?: string;
  userName?: string;
}

export interface ChatModeProjection {
  systemInstructions: ProviderSystemInstructions;
  toolPolicy: ProviderToolPolicy;
}

function toolPolicyFor(mode: ChatMode): ProviderToolPolicy {
  switch (mode) {
    case 'general':
      return { kind: 'passive' };
    case 'vault':
      return { kind: 'read-only' };
    case 'agent':
      return { kind: 'provider-default' };
  }
}

function providerDefaultInstructions(
  sections: readonly string[],
): ProviderSystemInstructions {
  return sections.length > 0
    ? { dynamicSections: [...sections], kind: 'provider-default' }
    : { kind: 'provider-default' };
}

/**
 * `dynamicSections` is passed through unchanged in every mode, even though its
 * only current producer -- the Collab-mode system prompt -- tells the model to
 * use file tools and a loopback RPC endpoint, neither of which works once the
 * tool policy is `passive` (General) or `read-only` (Vault). That mismatch is
 * accepted deliberately: these sections also carry user- and host-supplied
 * instructions that are not Collab-specific, and the tool policy already
 * enforces what the model can actually do regardless of what the prompt text
 * suggests. Do not "fix" this by filtering or gating the pass-through here.
 */
function systemInstructionsFor(
  mode: ChatMode,
  input: ChatModeProjectionInput,
): ProviderSystemInstructions {
  const sections = input.dynamicSections ?? [];
  switch (mode) {
    case 'general':
      return {
        instructions: [
          buildGeneralChatSystemPrompt({
            ...(input.customPrompt !== undefined ? { customPrompt: input.customPrompt } : {}),
            ...(input.userName !== undefined ? { userName: input.userName } : {}),
          }),
          ...sections,
        ].filter(Boolean).join('\n\n'),
        kind: 'explicit',
      };
    case 'vault':
      return providerDefaultInstructions([buildVaultSearchDynamicSection(), ...sections]);
    case 'agent':
      return providerDefaultInstructions(sections);
  }
}

/**
 * Translates a host-owned chat mode into the provider-neutral execution
 * contract. This is the only place that knows what a mode means; provider
 * backends already implement every policy it returns.
 */
export function projectChatMode(
  mode: ChatMode,
  input: ChatModeProjectionInput = {},
): ChatModeProjection {
  return {
    systemInstructions: systemInstructionsFor(mode, input),
    toolPolicy: toolPolicyFor(mode),
  };
}
