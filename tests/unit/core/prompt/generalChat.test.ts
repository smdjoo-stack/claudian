import { buildGeneralChatSystemPrompt } from '@/core/prompt/generalChat';

describe('buildGeneralChatSystemPrompt', () => {
  it('states that the conversation has no Vault access', () => {
    const prompt = buildGeneralChatSystemPrompt();
    expect(prompt).toContain('General mode');
    expect(prompt).toContain('no tools');
  });

  it('addresses the user by name when configured', () => {
    expect(buildGeneralChatSystemPrompt({ userName: 'joo' })).toContain('**joo**');
  });

  it('falls back to a generic addressee when the name is blank', () => {
    expect(buildGeneralChatSystemPrompt({ userName: '   ' })).toContain('the user');
  });

  it('keeps the shared user-message context section', () => {
    expect(buildGeneralChatSystemPrompt()).toContain('## User Message Context');
  });

  it('appends custom instructions when present', () => {
    const prompt = buildGeneralChatSystemPrompt({ customPrompt: 'Answer in Korean.' });
    expect(prompt).toContain('## Custom Instructions');
    expect(prompt).toContain('Answer in Korean.');
  });

  it('omits the custom instructions heading when blank', () => {
    expect(buildGeneralChatSystemPrompt({ customPrompt: '  ' }))
      .not.toContain('## Custom Instructions');
  });

  // These absence assertions are the reason this test exists: if Vault guidance
  // leaks into the General-mode prompt, the model reaches for tools it does not have.
  it('excludes every Vault-only section', () => {
    const prompt = buildGeneralChatSystemPrompt({ userName: 'joo' });
    expect(prompt).not.toContain('## Path Conventions');
    expect(prompt).not.toContain('## File Operations');
    expect(prompt).not.toContain('## Reference Conventions');
    expect(prompt).not.toContain('Vault absolute path');
    expect(prompt).not.toContain('bash: date');
  });
});
