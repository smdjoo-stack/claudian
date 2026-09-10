import { buildSystemPrompt } from '@/core/prompt/mainAgent';
import { buildVaultSearchDynamicSection } from '@/core/prompt/vaultSearch';

describe('buildVaultSearchDynamicSection', () => {
  it('tells the agent to search before answering', () => {
    const section = buildVaultSearchDynamicSection();
    expect(section).toContain('Grep');
    expect(section).toContain('Glob');
  });

  it('requires citing the notes it relied on', () => {
    expect(buildVaultSearchDynamicSection()).toContain('[[');
  });

  it('names the read-only boundary and the way out', () => {
    const section = buildVaultSearchDynamicSection();
    expect(section).toContain('read');
    expect(section).toContain('Agent mode');
  });

  it('survives being passed through buildSystemPrompt as a dynamic section', () => {
    const prompt = buildSystemPrompt(
      { vaultPath: '/vault', userName: 'joo' },
      { dynamicSections: [buildVaultSearchDynamicSection()] },
    );
    expect(prompt).toContain('## Vault Mode');
    expect(prompt).toContain('## Path Conventions');
  });
});
