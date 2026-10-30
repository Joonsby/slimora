import { describe, expect, it } from 'vitest';
import { gameConfig } from '../data';
import { SCENE_KEYS, sceneArt } from './backgrounds';
import { monsterSprite } from './monsters';
import { slimeLayers, slimePortrait } from './slime';

/** 문자열로 만든 SVG 가 깨지지 않았는지 — 값 누락 · 속성 사이 공백 누락은 그림 전체가 안 뜬다 */
function expectSane(svg: string) {
  expect(svg.startsWith('<svg ')).toBe(true);
  expect(svg).not.toMatch(/undefined|NaN|Infinity/);
  expect(svg).not.toMatch(/"[a-z-]+="/);
}

describe('아트', () => {
  it('모든 스테이지가 아는 배경 장면을 쓴다', () => {
    for (const stage of gameConfig.stages) expect(SCENE_KEYS).toContain(stage.scene);
  });

  it('배경 · 몬스터 · 슬라임 SVG 가 온전하다', () => {
    for (const key of SCENE_KEYS) {
      const art = sceneArt(key, 1);
      expectSane(art.backdrop.svg);
      expectSane(art.ground.svg);
    }
    for (const m of gameConfig.monsters) expectSane(monsterSprite(m.visual.preset, m.visual.tint, 1).svg);
    for (const preset of [null, 'vampire', 'iron', 'flame'] as const) {
      const layers = slimeLayers(preset, 1);
      for (const layer of [layers.back, layers.body, layers.face, layers.blink, layers.front]) if (layer) expectSane(layer.svg);
      expectSane(slimePortrait('#86ecc6', preset));
    }
  });
});
