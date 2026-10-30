import { monsterSprite } from '../art/monsters';
import { slimePortrait, type SlimePreset } from '../art/slime';
import { dataUrl } from '../art/svg';
import type { GameConfig } from '../core/model/config';

/** 메뉴에 쓰는 캐릭터 그림(data URL). 같은 그림은 한 번만 만든다 */
const cache = new Map<string, string>();

function cached(key: string, make: () => string): string {
  let url = cache.get(key);
  if (!url) {
    url = dataUrl(make());
    cache.set(key, url);
  }
  return url;
}

export function slimeImage(color: string, preset: SlimePreset): string {
  return cached(`slime:${color}:${preset}`, () => slimePortrait(color, preset, 1.5));
}

export function monsterImage(config: GameConfig, id: string): string {
  const def = config.monsters.find((m) => m.id === id);
  return cached(`mon:${id}`, () => monsterSprite(def?.visual.preset ?? 'golem', def?.visual.tint ?? '#999999', 1).svg);
}

/** 계열을 대표하는 몬스터 (그 계열의 첫 몬스터) */
export function familyImage(config: GameConfig, family: string): string {
  const def = config.monsters.find((m) => m.family === family);
  return def ? monsterImage(config, def.id) : '';
}
