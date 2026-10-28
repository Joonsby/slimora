import { describe, expect, it } from 'vitest';
import { cloneConfig } from '../testing/fixtures';
import { SLIME_BASE_COLOR, slimeTint } from './slimeColor';

const families = cloneConfig().families;
const channel = (color: number, shift: number) => (color >> shift) & 0xff;

describe('slimeTint — 흡수한 계열 색으로 물들기', () => {
  it('흡수가 없으면 기본색', () => {
    expect(slimeTint({}, families)).toBe(SLIME_BASE_COLOR);
  });

  it('화염을 많이 흡수할수록 주황 쪽(파랑 성분 감소)으로 물들고, 1,500 에서 멈춘다', () => {
    const blue = (n: number) => channel(slimeTint({ fire: n }, families), 0);
    expect(blue(100)).toBeLessThan(channel(SLIME_BASE_COLOR, 0));
    expect(blue(1000)).toBeLessThan(blue(100));
    expect(blue(1500)).toBe(blue(50_000));
  });

  it('가장 많이 흡수한 계열 색만 따라가고, 섞어 먹을수록 옅어진다', () => {
    const pureBat = slimeTint({ bat: 1500 }, families);
    const mostlyBat = slimeTint({ bat: 1000, fire: 500 }, families);
    // 박쥐(보라)는 초록 성분이 낮다 — 비중이 클수록 더 내려간다
    expect(channel(pureBat, 8)).toBeLessThan(channel(mostlyBat, 8));
    expect(channel(mostlyBat, 8)).toBeLessThan(channel(SLIME_BASE_COLOR, 8));
  });
});
