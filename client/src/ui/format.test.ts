import { describe, expect, it } from 'vitest';
import { formatMultiplier, formatNumber } from './format';

describe('숫자 표기', () => {
  it('만 미만은 그대로, 그 위는 K · M · B · T', () => {
    expect(formatNumber(9_999)).toBe('9,999');
    expect(formatNumber(12_345)).toBe('12.3K');
    expect(formatNumber(4_500_000)).toBe('4.5M');
    expect(formatNumber(7.2e12)).toBe('7.2T');
  });

  it('T 다음은 aa · ab … 로 이어진다', () => {
    expect(formatNumber(1.5e15)).toBe('1.5aa');
    expect(formatNumber(2e18)).toBe('2ab');
    expect(formatNumber(3e93)).toBe('3ba');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('∞');
  });

  it('배율 — 작으면 소수 둘째 자리, 크면 단위', () => {
    expect(formatMultiplier(1.21)).toBe('×1.21');
    expect(formatMultiplier(12.34)).toBe('×12.3');
    expect(formatMultiplier(123_456)).toBe('×123K');
  });
});
