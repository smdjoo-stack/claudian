import { projectChatMode } from '@/features/chat/state/ChatModeProjection';

describe('projectChatMode', () => {
  it('gives General mode no tools at all', () => {
    expect(projectChatMode('general').toolPolicy).toEqual({ kind: 'passive' });
  });

  it('gives Vault mode the read-only policy', () => {
    expect(projectChatMode('vault').toolPolicy).toEqual({ kind: 'read-only' });
  });

  it('leaves Agent mode on the provider default', () => {
    expect(projectChatMode('agent').toolPolicy).toEqual({ kind: 'provider-default' });
  });

  it('replaces the system prompt entirely in General mode', () => {
    const projection = projectChatMode('general', { userName: 'joo' });
    expect(projection.systemInstructions.kind).toBe('explicit');
    if (projection.systemInstructions.kind !== 'explicit') throw new Error('unreachable');
    expect(projection.systemInstructions.instructions).toContain('General mode');
    expect(projection.systemInstructions.instructions).not.toContain('## Path Conventions');
  });

  it('keeps instruction-mode sections in General mode', () => {
    const projection = projectChatMode('general', {
      dynamicSections: ['## Extra\n\nBe terse.'],
    });
    if (projection.systemInstructions.kind !== 'explicit') throw new Error('unreachable');
    expect(projection.systemInstructions.instructions).toContain('Be terse.');
  });

  it('adds the search directive on top of the Vault prompt', () => {
    const projection = projectChatMode('vault');
    expect(projection.systemInstructions.kind).toBe('provider-default');
    if (projection.systemInstructions.kind !== 'provider-default') throw new Error('unreachable');
    expect(projection.systemInstructions.dynamicSections?.[0]).toContain('## Vault Mode');
  });

  it('keeps instruction-mode sections after the Vault directive', () => {
    const projection = projectChatMode('vault', {
      dynamicSections: ['## Extra\n\nBe terse.'],
    });
    if (projection.systemInstructions.kind !== 'provider-default') throw new Error('unreachable');
    expect(projection.systemInstructions.dynamicSections).toHaveLength(2);
    expect(projection.systemInstructions.dynamicSections?.[1]).toContain('Be terse.');
  });

  it('leaves Agent mode instructions untouched when there are no sections', () => {
    expect(projectChatMode('agent').systemInstructions).toEqual({ kind: 'provider-default' });
  });

  it('passes instruction-mode sections straight through in Agent mode', () => {
    const projection = projectChatMode('agent', {
      dynamicSections: ['## Extra\n\nBe terse.'],
    });
    expect(projection.systemInstructions).toEqual({
      dynamicSections: ['## Extra\n\nBe terse.'],
      kind: 'provider-default',
    });
  });
});
