import type { AllyStats } from '../model/battle';
import type { RuleError } from '../model/commands';
import type { GameConfig, MercenaryDef, Rarity } from '../model/config';
import type { MercenaryId, StageId } from '../model/ids';
import type { MercenaryProgress, ProgressState } from '../model/progress';
import { err, ok, type Result } from '../result';
import { nextFloat } from '../rng';

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'legendary'];

export function findMercenary(cfg: GameConfig, id: MercenaryId): MercenaryDef | undefined {
  return cfg.mercenaries.find((m) => m.id === id);
}

/** 용병 하나가 뽑힐 확률 — 등급 확률을 그 등급의 용병 수로 나눈다 (확률 공개용) */
export function mercenaryRate(def: MercenaryDef, cfg: GameConfig): number {
  return cfg.balance.gacha.rates[def.rarity] / cfg.mercenaries.filter((m) => m.rarity === def.rarity).length;
}

/**
 * 뽑기 결과. 등급을 확률로 고르고 그 등급 안에서 고르게. 10회 뽑기는 희귀 이상이 하나도 없으면 마지막을 희귀로 바꾼다.
 * 같은 seed 면 같은 결과 — 세션이 결과를 보여 줄 때 다시 굴려도 같다
 */
export function rollSummon(count: number, seed: number, cfg: GameConfig): MercenaryId[] {
  const rng = { s: seed | 0 };
  const { rates } = cfg.balance.gacha;
  const pickIn = (rarity: Rarity) => {
    const pool = cfg.mercenaries.filter((m) => m.rarity === rarity);
    return pool[Math.min(pool.length - 1, Math.floor(nextFloat(rng) * pool.length))]!.id;
  };
  const rarities: Rarity[] = [];
  for (let i = 0; i < count; i++) {
    let roll = nextFloat(rng);
    let rarity: Rarity = 'common';
    for (const r of RARITIES) {
      if (roll < rates[r]) {
        rarity = r;
        break;
      }
      roll -= rates[r];
    }
    rarities.push(rarity);
  }
  if (count >= 10 && !rarities.some((r) => r !== 'common')) rarities[rarities.length - 1] = 'rare';
  return rarities.map(pickIn);
}

export interface SummonPull {
  id: MercenaryId;
  /** 처음 얻었다 */
  isNew: boolean;
  /** 뽑은 뒤 레벨 */
  level: number;
  /** 최대 레벨이라 보석으로 돌려받은 양 */
  refund: number;
}

/** 보석으로 뽑는다. 처음 얻은 용병은 빈 자리가 있으면 바로 편성한다 */
export function summon(p: ProgressState, count: 1 | 10, seed: number, cfg: GameConfig): Result<{ progress: ProgressState; pulls: SummonPull[] }, RuleError> {
  const { single, ten, maxLevel, maxedRefund } = cfg.balance.gacha;
  const cost = count === 10 ? ten : single;
  if (p.gems < cost) return err({ code: 'NOT_ENOUGH_GEMS', need: cost, have: p.gems });
  const owned = { ...p.mercenaries.owned };
  const party = [...p.mercenaries.party];
  const pulls: SummonPull[] = [];
  let refund = 0;
  for (const id of rollSummon(count, seed, cfg)) {
    const level = owned[id] ?? 0;
    if (level === 0) {
      owned[id] = 1;
      if (party.length < cfg.balance.party.slots) party.push(id);
      pulls.push({ id, isNew: true, level: 1, refund: 0 });
    } else if (level < maxLevel) {
      owned[id] = level + 1;
      pulls.push({ id, isNew: false, level: level + 1, refund: 0 });
    } else {
      refund += maxedRefund;
      pulls.push({ id, isNew: false, level, refund: maxedRefund });
    }
  }
  return ok({ progress: { ...p, gems: p.gems - cost + refund, mercenaries: { owned, party } }, pulls });
}

export function setParty(p: ProgressState, party: MercenaryId[], cfg: GameConfig): Result<ProgressState, RuleError> {
  const valid = party.length <= cfg.balance.party.slots && new Set(party).size === party.length && party.every((id) => (p.mercenaries.owned[id] ?? 0) > 0);
  if (!valid) return err({ code: 'INVALID_PARTY' });
  return ok({ ...p, mercenaries: { ...p.mercenaries, party } });
}

/** 오늘 광고로 더 받을 수 있는 횟수 */
export function adGemsLeft(p: ProgressState, day: string, cfg: GameConfig): number {
  const used = p.daily.day === day ? p.daily.adGems : 0;
  return Math.max(0, cfg.balance.gems.adDailyLimit - used);
}

export function claimAdGems(p: ProgressState, day: string, cfg: GameConfig): Result<ProgressState, RuleError> {
  if (adGemsLeft(p, day, cfg) <= 0) return err({ code: 'AD_LIMIT' });
  const used = p.daily.day === day ? p.daily.adGems : 0;
  return ok({ ...p, gems: p.gems + cfg.balance.gems.adReward, daily: { day, adGems: used + 1 } });
}

/** 처음 깬 스테이지의 보석 */
export function firstClearGems(stage: StageId, cfg: GameConfig): number {
  const g = cfg.balance.gems;
  return g.firstClearBase + g.firstClearPerStage * (stage - 1);
}

const levelOf = (m: MercenaryProgress, id: MercenaryId) => Math.max(1, m.owned[id] ?? 1);

/** 레벨을 반영한 지원 공격 · 패시브 수치 */
export function mercenaryPower(def: MercenaryDef, level: number, cfg: GameConfig): { power: number; passive: number } {
  const { supportPerLevel, passivePerLevel } = cfg.balance.party;
  return { power: def.support.power * (1 + supportPerLevel * (level - 1)), passive: def.passive.value * (1 + passivePerLevel * (level - 1)) };
}

/** 편성한 용병의 지원 공격 */
export function partyAllies(m: MercenaryProgress, cfg: GameConfig): AllyStats[] {
  return m.party.flatMap((id) => {
    const def = findMercenary(cfg, id);
    if (!def) return [];
    return [{ id, power: mercenaryPower(def, levelOf(m, id), cfg).power, intervalMs: def.support.intervalMs }];
  });
}

/** 편성한 용병의 패시브 합 (attack · maxHp · gold 는 배율에 더할 비율, 나머지는 그대로 더한다) */
export function partyPassive(m: MercenaryProgress, cfg: GameConfig): Record<MercenaryDef['passive']['stat'], number> {
  const sum = { attack: 0, maxHp: 0, gold: 0, critChance: 0, damageReduction: 0 };
  for (const id of m.party) {
    const def = findMercenary(cfg, id);
    if (def) sum[def.passive.stat] += mercenaryPower(def, levelOf(m, id), cfg).passive;
  }
  return sum;
}
