import { findUpgrade, hasStage } from '../lookup';
import type { GameCommand, RuleError } from '../model/commands';
import type { GameConfig } from '../model/config';
import type { ProgressState, StageProgress } from '../model/progress';
import { err, ok, type Result } from '../result';
import { checkEvolve } from './forms';
import { getUpgradeCost, isMaxLevel } from './upgrades';

/** 진행 상태의 유일한 변경 경로. 원본을 바꾸지 않고 새 상태를 돌려준다 */
export function applyCommand(s: ProgressState, c: GameCommand, cfg: GameConfig): Result<ProgressState, RuleError> {
  switch (c.type) {
    case 'grantBattleReward': {
      const absorbEntries = Object.entries(c.absorb ?? {});
      if (!isAmount(c.gold) || !absorbEntries.every(([, n]) => isAmount(n))) return err({ code: 'INVALID_REWARD' });
      const kills = { ...s.lifetime.kills };
      for (const [family, n] of Object.entries(c.kills)) {
        kills[family] = (kills[family] ?? 0) + (n ?? 0);
      }
      let slime = s.slime;
      if (absorbEntries.length > 0) {
        const absorption = { ...s.slime.absorption };
        for (const [family, n] of absorbEntries) absorption[family] = (absorption[family] ?? 0) + (n ?? 0);
        slime = { ...s.slime, absorption };
      }
      return ok({
        ...s,
        gold: s.gold + c.gold,
        slime,
        lifetime: { ...s.lifetime, kills, goldEarned: s.lifetime.goldEarned + c.gold },
      });
    }

    case 'purchaseUpgrade': {
      const def = findUpgrade(cfg, c.upgrade);
      if (!def) return err({ code: 'UNKNOWN_UPGRADE' });
      const level = s.slime.upgrades[c.upgrade] ?? 0;
      if (isMaxLevel(def, level)) return err({ code: 'MAX_LEVEL' });
      const cost = getUpgradeCost(def, level);
      if (s.gold < cost) return err({ code: 'NOT_ENOUGH_GOLD', need: cost, have: s.gold });
      return ok({
        ...s,
        gold: s.gold - cost,
        slime: { ...s.slime, upgrades: { ...s.slime.upgrades, [c.upgrade]: level + 1 } },
      });
    }

    case 'stageCleared': {
      const next = c.stage + 1;
      const advance = s.stage.autoAdvance && hasStage(cfg, next);
      return ok(
        withStage(s, {
          highestCleared: Math.max(s.stage.highestCleared, c.stage),
          current: advance ? next : c.stage,
          mode: advance ? 'challenge' : 'farm',
        }),
      );
    }

    case 'challengeFailed': {
      // 최고 클리어 스테이지로 후퇴하고 자동진행을 끈다. 클리어한 곳이 없으면 1 스테이지 재도전
      if (s.stage.highestCleared === 0) return ok(withStage(s, { current: 1, mode: 'challenge' }));
      return ok(withStage(s, { current: s.stage.highestCleared, mode: 'farm', autoAdvance: false }));
    }

    case 'recordDeath':
      return ok({ ...s, lifetime: { ...s.lifetime, deaths: s.lifetime.deaths + 1 } });

    case 'enterStage': {
      const limit = c.mode === 'farm' ? s.stage.highestCleared : s.stage.highestCleared + 1;
      if (!hasStage(cfg, c.stage) || c.stage > limit) return err({ code: 'STAGE_LOCKED', stage: c.stage });
      return ok(withStage(s, { current: c.stage, mode: c.mode }));
    }

    case 'setAutoAdvance':
      return ok(withStage(s, { autoAdvance: c.on }));

    case 'evolve': {
      const check = checkEvolve(s, c.form, cfg, c.inBossFight);
      if (!check.ok) return err(check.error);
      const unlockedForms = s.slime.unlockedForms.includes(c.form) ? s.slime.unlockedForms : [...s.slime.unlockedForms, c.form];
      return ok({ ...s, gold: s.gold - check.value.cost, slime: { ...s.slime, form: c.form, unlockedForms } });
    }
  }
}

function isAmount(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function withStage(s: ProgressState, patch: Partial<StageProgress>): ProgressState {
  return { ...s, stage: { ...s.stage, ...patch } };
}
