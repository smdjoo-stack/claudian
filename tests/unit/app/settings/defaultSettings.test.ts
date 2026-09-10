import { DEFAULT_CLAUDIAN_SETTINGS } from '@/app/settings/defaultSettings';

describe('DEFAULT_CLAUDIAN_SETTINGS chat mode', () => {
  it('starts new tabs from the last used mode', () => {
    expect(DEFAULT_CLAUDIAN_SETTINGS.defaultChatMode).toBe('last-used');
  });

  it('remembers General as the initial mode', () => {
    expect(DEFAULT_CLAUDIAN_SETTINGS.lastUsedChatMode).toBe('general');
  });
});
