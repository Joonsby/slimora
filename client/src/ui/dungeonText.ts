import type { ComponentType } from 'react';
import type { GameConfig } from '../core/model/config';
import type { BossPatternKind, DamageSource, MercLinkEffect, SkillId } from '../core/model/dungeon';
import { IconChain, IconFireburst, IconFrenzy, IconPoison, IconShield, IconSplit } from './icons';

export const SKILL_ICON: Record<SkillId, ComponentType<{ size?: number }>> = {
  fireburst: IconFireburst,
  chain: IconChain,
  split: IconSplit,
  poison: IconPoison,
  shield: IconShield,
  frenzy: IconFrenzy,
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number) => `${Number((ms / 1000).toFixed(1))}초`;

/** 그 단계의 효과 한 줄 */
export function skillLevelText(id: SkillId, level: number, cfg: GameConfig): string {
  const s = cfg.dungeon.skills;
  switch (id) {
    case 'fireburst': {
      const l = s.fireburst.levels[level - 1]!;
      return `${l.every}번째 공격마다 폭발 — 주변 적에게 공격력 ${pct(l.mul)}${l.burn ? ' + 화상' : ''}`;
    }
    case 'chain': {
      const l = s.chain.levels[level - 1]!;
      return `${l.every}번째 공격마다 번개가 ${l.jumps}번 튄다 (공격력 ${pct(l.mul)})${l.stunChance > 0 ? ` · ${pct(l.stunChance)} 기절` : ''}`;
    }
    case 'split': {
      const l = s.split.levels[level - 1]!;
      return `공격마다 분열탄 ${l.extra}개가 다른 적에게 (공격력 ${pct(l.mul)})`;
    }
    case 'poison': {
      const l = s.poison.levels[level - 1]!;
      return `맞힐 때마다 독 — 중첩당 초당 공격력 ${pct(l.dps)}, 최대 ${l.maxStacks}중첩${l.spread ? ' · 쓰러지면 옆으로 번짐' : ''}`;
    }
    case 'shield': {
      const l = s.shield.levels[level - 1]!;
      return `HP ${pct(l.hpBelow)} 아래면 최대 HP ${pct(l.ratio)} 보호막 (${sec(l.cooldownMs)}마다)${l.shockwave > 0 ? ` · 깨지면 충격파 ${pct(l.shockwave)}` : ''}`;
    }
    case 'frenzy': {
      const l = s.frenzy.levels[level - 1]!;
      return `처치마다 광폭 (최대 ${l.maxStacks}중첩) — 중첩당 공격 속도 +${pct(l.speed)}${l.lowHpFull ? ' · HP 절반 이하면 최대' : ''}`;
    }
  }
}

export const PATTERN_NAME: Record<BossPatternKind, string> = { smash: '내려찍기', breath: '화염 숨결', guard: '경화', summon: '부하 소환' };
export const COUNTER_HINT: Record<'block' | 'weaken' | 'break', string> = { block: '필살기로 끊기!', weaken: '필살기로 약화!', break: '필살기로 깨기!' };

export const SOURCE_NAME: Record<DamageSource, string> = {
  hit: '기본 공격',
  split: '분열 공격',
  explosion: '화염 폭발',
  lightning: '연쇄 번개',
  poison: '독',
  burn: '화상',
  splash: '불꽃 확산',
  ally: '용병',
  ultimate: '필살기',
  thorns: '가시 반격',
  shockwave: '충격파',
};

export const SOURCE_COLOR: Record<DamageSource, string> = {
  hit: '#ffd84a',
  split: '#7be495',
  explosion: '#ff7b39',
  lightning: '#8fd8ff',
  poison: '#a3e635',
  burn: '#ff9a3c',
  splash: '#ffb066',
  ally: '#8fe9ff',
  ultimate: '#ffe27a',
  thorns: '#c3cede',
  shockwave: '#5ee4ff',
};

export function linkEffectText(e: MercLinkEffect): string {
  switch (e.kind) {
    case 'allyHeal':
      return `용병 피해의 ${pct(e.ratio)}만큼 회복`;
    case 'guardBoost':
      return `보호막 · 반격 +${pct(e.ratio)}`;
    case 'allyBurn':
      return `용병 공격에 화상 ${e.stacks}중첩`;
    case 'allySplit':
      return `용병 공격도 ${e.extra}갈래로 분열`;
  }
}
