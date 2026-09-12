import { commandSummary } from '@/features/chat/ui/commandSummary';

describe('commandSummary', () => {
  it('keeps only the first sentence', () => {
    expect(commandSummary('수집함 전체를 위키로 만든다. 특정 파일만 처리하려면 /위키.'))
      .toBe('수집함 전체를 위키로 만든다.');
  });

  it('leaves a single-sentence description alone', () => {
    expect(commandSummary('지정한 폴더를 위키로 만든다.')).toBe('지정한 폴더를 위키로 만든다.');
  });

  it('does not split on a decimal point or a leading index', () => {
    expect(commandSummary('00. 수집함을 정리한다. 그다음 단계.')).toBe('00. 수집함을 정리한다.');
  });

  it('handles a description with no sentence break', () => {
    expect(commandSummary('볼트 현황 보고')).toBe('볼트 현황 보고');
  });

  it('handles question and exclamation endings', () => {
    expect(commandSummary('무엇을 할까? 두 번째 문장.')).toBe('무엇을 할까?');
  });

  it('returns undefined for nothing', () => {
    expect(commandSummary(undefined)).toBeUndefined();
    expect(commandSummary('   ')).toBeUndefined();
  });
});
