import {
  CHAT_MODES,
  FALLBACK_CHAT_MODE,
  isChatMode,
  normalizeChatMode,
  resolveInitialChatMode,
} from '@/core/types/chatMode';

describe('chatMode', () => {
  it('exposes exactly three modes in display order', () => {
    expect(CHAT_MODES).toEqual(['general', 'vault', 'agent']);
  });

  it('falls back to general', () => {
    expect(FALLBACK_CHAT_MODE).toBe('general');
  });

  it('recognizes valid modes', () => {
    expect(isChatMode('general')).toBe(true);
    expect(isChatMode('vault')).toBe(true);
    expect(isChatMode('agent')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isChatMode('Vault')).toBe(false);
    expect(isChatMode('last-used')).toBe(false);
    expect(isChatMode('')).toBe(false);
    expect(isChatMode(undefined)).toBe(false);
    expect(isChatMode(null)).toBe(false);
    expect(isChatMode(2)).toBe(false);
  });

  it('normalizes unknown values to the fallback', () => {
    expect(normalizeChatMode('vault')).toBe('vault');
    expect(normalizeChatMode('nope')).toBe('general');
    expect(normalizeChatMode(undefined, 'agent')).toBe('agent');
  });

  it('resolves last-used preference to the remembered mode', () => {
    expect(resolveInitialChatMode('last-used', 'vault')).toBe('vault');
    expect(resolveInitialChatMode('last-used', 'garbage')).toBe('general');
  });

  it('resolves a pinned preference to that mode', () => {
    expect(resolveInitialChatMode('agent', 'vault')).toBe('agent');
  });

  it('falls back to the remembered mode when the preference is garbage', () => {
    expect(resolveInitialChatMode('garbage', 'vault')).toBe('vault');
  });
});
