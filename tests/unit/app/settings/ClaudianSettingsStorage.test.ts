import '@/providers';

import {
  CLAUDIAN_SETTINGS_PATH,
  ClaudianSettingsStorage,
} from '@/app/settings/ClaudianSettingsStorage';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';

function createAdapter(
  stored: Record<string, unknown>,
): jest.Mocked<VaultFileAdapter> {
  return {
    exists: jest.fn().mockImplementation(async (path: string) => (
      path === CLAUDIAN_SETTINGS_PATH
    )),
    read: jest.fn().mockResolvedValue(JSON.stringify(stored)),
    write: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<VaultFileAdapter>;
}

function createAdapterWithNoSettingsFile(): jest.Mocked<VaultFileAdapter> {
  return {
    exists: jest.fn().mockResolvedValue(false),
    read: jest.fn().mockRejectedValue(new Error('no settings file to read')),
    write: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<VaultFileAdapter>;
}

describe('ClaudianSettingsStorage Linked content migration', () => {
  it('imports legacy organization and pinned paths before defaults and awaits canonical persistence', async () => {
    const adapter = createAdapter({
      sessionManagerOrganization: 'linked-note',
      pinnedLinkedNotePaths: [
        'Notes\\Plan.md',
        './Notes/Plan.md',
        'Projects//Research',
        '../outside',
      ],
    });
    let releaseWrite!: () => void;
    let signalWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    adapter.write.mockImplementation(() => new Promise<void>((resolve) => {
      signalWriteStarted();
      releaseWrite = resolve;
    }));
    const storage = new ClaudianSettingsStorage(adapter);

    let resolved = false;
    const load = storage.load().then((settings) => {
      resolved = true;
      return settings;
    });
    await writeStarted;

    expect(adapter.write).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    releaseWrite();

    await expect(load).resolves.toMatchObject({
      sessionManagerOrganization: 'linked-content',
      pinnedLinkedContentPaths: [
        'Notes/Plan.md',
        'Projects/Research',
      ],
    });
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.sessionManagerOrganization).toBe('linked-content');
    expect(persisted.pinnedLinkedContentPaths).toEqual([
      'Notes/Plan.md',
      'Projects/Research',
    ]);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });

  it('lets an explicitly stored canonical empty list win over legacy pins', async () => {
    const adapter = createAdapter({
      pinnedLinkedContentPaths: [],
      pinnedLinkedNotePaths: ['Notes/Legacy.md'],
    });
    const storage = new ClaudianSettingsStorage(adapter);

    const settings = await storage.load();

    expect(settings.pinnedLinkedContentPaths).toEqual([]);
    expect(adapter.write).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.pinnedLinkedContentPaths).toEqual([]);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });

  it('normalizes canonical pins without falling back to the legacy field', async () => {
    const adapter = createAdapter({
      pinnedLinkedContentPaths: [
        'Projects\\Current',
        './Projects/Current',
        '../invalid',
      ],
      pinnedLinkedNotePaths: ['Notes/Legacy.md'],
    });
    const storage = new ClaudianSettingsStorage(adapter);

    const settings = await storage.load();

    expect(settings.pinnedLinkedContentPaths).toEqual(['Projects/Current']);
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.pinnedLinkedContentPaths).toEqual(['Projects/Current']);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });

  it('omits legacy pinned paths from future writes', async () => {
    const adapter = createAdapter({});
    const storage = new ClaudianSettingsStorage(adapter);

    await storage.save({
      ...await storage.load(),
      pinnedLinkedContentPaths: ['Projects/Current'],
      pinnedLinkedNotePaths: ['Notes/Legacy.md'],
    });

    const persisted = JSON.parse(adapter.write.mock.calls.at(-1)![1]);
    expect(persisted.pinnedLinkedContentPaths).toEqual(['Projects/Current']);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });
});

describe('ClaudianSettingsStorage lastUsedChatMode migration', () => {
  it('starts a fresh install with no settings file in general mode', async () => {
    const adapter = createAdapterWithNoSettingsFile();
    const storage = new ClaudianSettingsStorage(adapter);

    const settings = await storage.load();

    expect(settings.lastUsedChatMode).toBe('general');
    expect(adapter.write).not.toHaveBeenCalled();
  });

  it('migrates an existing install predating chat modes to agent mode and persists it', async () => {
    const adapter = createAdapter({});
    const storage = new ClaudianSettingsStorage(adapter);

    const settings = await storage.load();

    expect(settings.lastUsedChatMode).toBe('agent');
    expect(adapter.write).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.lastUsedChatMode).toBe('agent');
  });

  it('keeps an already-stored chat mode without overwriting it via migration', async () => {
    const adapter = createAdapter({ lastUsedChatMode: 'vault' });
    const storage = new ClaudianSettingsStorage(adapter);

    const settings = await storage.load();

    expect(settings.lastUsedChatMode).toBe('vault');
  });

  it('falls back a corrupted stored value to general mode, not agent mode', async () => {
    const adapter = createAdapter({ lastUsedChatMode: 'nonsense' });
    const storage = new ClaudianSettingsStorage(adapter);

    const settings = await storage.load();

    expect(settings.lastUsedChatMode).toBe('general');
  });
});
