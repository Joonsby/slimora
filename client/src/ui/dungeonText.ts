import type { ComponentType } from 'react';
import type { AdviceId } from '../core/dungeon/advice';
import type { GameConfig } from '../core/model/config';
import type { BossPatternKind, DamageSource, HurtSource, MercLinkEffect, SkillId } from '../core/model/dungeon';
import { IconChain, IconFireburst, IconFrenzy, IconPoison, IconShield, IconSplit } from './icons';

export const SKILL_ICON: Record<SkillId, ComponentType<{ size?: number }>> = {
  fireburst: IconFireburst,
  chain: IconChain,
  split: IconSplit,
  poison: IconPoison,
  shield: IconShield,
  frenzy: IconFrenzy,
};

/** 선택 카드에 붙는 쓰임 — 어떤 상황에 강한가 */
export const SKILL_ROLE: Record<SkillId, string> = {
  fireburst: '여러 적 · 범위',
  chain: '여러 적 · 연쇄',
  split: '여러 적 · 다발',
  poison: '보스 · 단단한 적',
  shield: '생존 · 큰 공격 대비',
  frenzy: '보스 · 처치 가속',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number) => `${Number((ms / 1000).toFixed(1))}초`;

/** 그 단계의 효과 한 줄 */
export function skillLevelText(id: SkillId, level: number, cfg: GameConfig): string {
  const s = cfg.dungeon.skills;
  switch (id) {
    case 'fireburst': {
      const l = s.fireburst.levels[level - 1]!;
      return `${l.every}번째 공격마다 폭발 — 주변 적에게 공격력 ${pct(l.mul)}${l.center > 0 ? ` (중심 +${pct(l.center)})` : ''}${l.burn ? ' + 화상' : ''}`;
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

/** 쓰러뜨린 공격 */
export const HURT_NAME: Record<HurtSource, string> = { hit: '적의 공격', burn: '화상', smash: '내려찍기', breath: '화염 숨결', guard: '보스의 공격', summon: '보스의 공격' };

/** 다음 도전에서 해 볼 것 */
export const ADVICE_TEXT: Record<AdviceId, string> = {
  ultUnused: '필살기가 다 찬 채로 큰 공격을 맞았어요. 보스가 붉게 빛나며 예고할 때 바로 눌러 보세요.',
  blockSmash: '내려찍기는 예고 중에 필살기를 쓰면 끊겨요. 보스가 휘청이며 더 아프게 맞아요.',
  weakenBreath: '화염 숨결은 예고 중에 필살기를 쓰면 크게 약해져요.',
  saveForBoss: '큰 공격이 올 때 필살기가 비어 있었어요. 보스 웨이브 직전에는 아껴 두세요.',
  breakGuard: '돌빛으로 굳은 보스는 피해를 크게 줄여요. 필살기로 경화를 깰 수 있어요.',
  aoe: '몬스터가 많을 땐 화염 폭발 · 연쇄 번개 · 분열 공격처럼 여러 적을 치는 스킬이 좋아요.',
  bossSkills: '보스에겐 독성 공격(피해 감소 무시)이나 광폭화처럼 한 적에게 강한 스킬이 좋아요.',
  synergy: '짝이 맞는 두 스킬을 모으면 시너지가 켜져 훨씬 강해져요. 카드의 ◆ 표시를 찾아보세요.',
  grow: '지금 힘에는 벅찬 단계예요. 한 단계 낮추거나, 연구 · 사냥터에서 강해진 뒤 다시 와 보세요.',
};

/** 단계 난이도 표시 */
export const DIFFICULTY_NAME = { easy: '쉬움', fair: '적정', hard: '어려움', brutal: '매우 어려움' } as const;

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
