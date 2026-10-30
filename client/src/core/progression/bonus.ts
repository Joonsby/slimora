import type { GameConfig } from '../model/config';
import type { ProgressState } from '../model/progress';
import { partyPassive } from './mercenary';
import { legacyBonus } from './prestige';

/** 슬라임에 붙는 보너스 전부 — 정수 강화 + 편성한 용병의 패시브 */
export interface SlimeBonus {
  /** 곱하는 배율 */
  attack: number;
  maxHp: number;
  gold: number;
  /** 오프라인 보상 상한에 더하는 시간 */
  offlineMs: number;
  /** 그대로 더한다 (상한은 능력치 계산에서) */
  critChance: number;
  damageReduction: number;
}

export function slimeBonus(p: Pick<ProgressState, 'prestige' | 'mercenaries'>, cfg: GameConfig): SlimeBonus {
  const legacy = legacyBonus(p.prestige, cfg);
  const party = partyPassive(p.mercenaries, cfg);
  return {
    attack: legacy.attack * (1 + party.attack),
    maxHp: legacy.maxHp * (1 + party.maxHp),
    gold: legacy.gold * (1 + party.gold),
    offlineMs: legacy.offlineMs,
    critChance: party.critChance,
    damageReduction: party.damageReduction,
  };
}
