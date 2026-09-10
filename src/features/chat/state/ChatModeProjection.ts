import type { ChatMode } from '@/core/types/ChatMode';

import type {
  ProviderSystemInstructions,
  ProviderToolPolicy,
} from '../../../core/execution';
import { buildGeneralChatSystemPrompt } from '../../../core/prompt/generalChat';
import { buildVaultSearchDynamicSection } from '../../../core/prompt/vaultSearch';

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
