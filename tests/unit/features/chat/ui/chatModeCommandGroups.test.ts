import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { groupCommandsByCategory } from '@/features/chat/ui/chatModeCommandGroups';

function entry(name: string, category?: string): ProviderCommandEntry {
  return {
    id: `cmd-${name}`,
    providerId: 'claude',
    kind: 'command',
    name,
    category,
    content: '',
    scope: 'vault',
    source: 'user',
    isEditable: true,
    isDeletable: true,
    displayPrefix: '/',
    insertPrefix: '/',
  };
}

describe('groupCommandsByCategory', () => {
  it('orders numbered categories by their number, not alphabetically', () => {
    const groups = groupCommandsByCategory([
      entry('질문', '3. 조회 (읽기 전용)'),
      entry('주석', '2. 설교 준비 흐름'),
      entry('수집', '1. 수집 · 위키 만들기'),
    ]);

    expect(groups.map(group => group.heading)).toEqual([
      '수집 · 위키 만들기',
      '설교 준비 흐름',
      '조회 (읽기 전용)',
    ]);
  });

  it('strips the ordering prefix from the displayed heading', () => {
    const [group] = groupCommandsByCategory([entry('수집', '1. 수집 · 위키 만들기')]);

    expect(group.heading).toBe('수집 · 위키 만들기');
  });

  it('keeps commands of the same category together, sorted by name', () => {
    const groups = groupCommandsByCategory([
      entry('위키', '1. 수집 · 위키 만들기'),
      entry('등록', '1. 수집 · 위키 만들기'),
      entry('수집', '1. 수집 · 위키 만들기'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].commands.map(command => command.name)).toEqual(['등록', '수집', '위키']);
  });

  it('sorts unnumbered categories alphabetically after numbered ones', () => {
    const groups = groupCommandsByCategory([
      entry('b', 'Zebra'),
      entry('a', 'Apple'),
      entry('c', '1. First'),
    ]);

    expect(groups.map(group => group.heading)).toEqual(['First', 'Apple', 'Zebra']);
  });

  it('puts uncategorized commands last under no heading', () => {
    const groups = groupCommandsByCategory([
      entry('loose'),
      entry('수집', '1. 수집 · 위키 만들기'),
    ]);

    expect(groups.map(group => group.heading)).toEqual(['수집 · 위키 만들기', null]);
    expect(groups[1].commands.map(command => command.name)).toEqual(['loose']);
  });

  it('returns a single unheaded group when nothing is categorized', () => {
    const groups = groupCommandsByCategory([entry('b'), entry('a')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBeNull();
    expect(groups[0].commands.map(command => command.name)).toEqual(['a', 'b']);
  });

  it('returns no groups for no commands', () => {
    expect(groupCommandsByCategory([])).toEqual([]);
  });
});
