import type { RuleError } from '../model/commands';
import type { FormDef, GameConfig } from '../model/config';
import type { EffectSpec } from '../model/effects';
import type { FamilyId, FormId } from '../model/ids';
import type { ProgressState, SlimeProgress } from '../model/progress';
import { err, ok, type Result } from '../result';

export type FormStatus = 'locked' | 'available' | 'unlocked' | 'current';
export type FormChange = { type: 'formAvailable'; form: FormId } | { type: 'masteryUp'; form: FormId; level: number };

type SlimeForms = Pick<SlimeProgress, 'absorption' | 'form' | 'unlockedForms'>;

export function findForm(cfg: GameConfig, id: FormId): FormDef | undefined {
  return cfg.forms.find((f) => f.id === id);
}

export function meetsRequirement(form: FormDef, absorption: Partial<Record<FamilyId, number>>, highestCleared: number): boolean {
  return (absorption[form.family] ?? 0) >= form.requires.absorb && highestCleared >= form.requires.stageCleared;
}

/** LOCKED → AVAILABLE → CURRENT ⇄ UNLOCKED. 흡수량 · 클리어 기록은 줄지 않으므로 되돌아가지 않는다 */
export function formStatus(form: FormDef, slime: SlimeForms, highestCleared: number): FormStatus {
  if (slime.form === form.id) return 'current';
  if (slime.unlockedForms.includes(form.id)) return 'unlocked';
  return meetsRequirement(form, slime.absorption, highestCleared) ? 'available' : 'locked';
}

/** 처음 진화하는 형태는 무료, 해금해 둔 형태로 돌아갈 때만 골드를 낸다 */
export function evolveCost(form: FormDef, slime: SlimeForms, highestCleared: number, cfg: GameConfig): number {
  if (!slime.unlockedForms.includes(form.id)) return 0;
  const e = cfg.balance.evolution;
  return Math.floor(e.switchCostBase * e.switchCostGrowth ** highestCleared);
}

/** 0 = 숙련 없음, 1 부터 단계. 그 형태 계열의 흡수량으로 정해진다 */
export function masteryLevel(form: FormDef, absorption: Partial<Record<FamilyId, number>>): number {
  const amount = absorption[form.family] ?? 0;
  let level = 0;
  form.mastery.forEach((m, i) => {
    if (amount >= m.minAbsorb) level = i + 1;
  });
  return level;
}

export function collectFormEffects(slime: { absorption?: Partial<Record<FamilyId, number>>; form?: FormId | null }, cfg: GameConfig): EffectSpec[] {
  const form = slime.form ? findForm(cfg, slime.form) : undefined;
  if (!form) return [];
  const level = masteryLevel(form, slime.absorption ?? {});
  return level > 0 ? form.mastery[level - 1]!.effects : [];
}

/** 검사 순서: 보스전 → 이미 현재 형태 → 요건 → 골드 */
export function checkEvolve(s: ProgressState, formId: FormId, cfg: GameConfig, inBossFight: boolean): Result<{ cost: number }, RuleError> {
  const form = findForm(cfg, formId);
  if (!form) return err({ code: 'UNKNOWN_FORM' });
  if (inBossFight) return err({ code: 'IN_BOSS_FIGHT' });
  const status = formStatus(form, s.slime, s.stage.highestCleared);
  if (status === 'current') return err({ code: 'ALREADY_CURRENT' });
  if (status === 'locked') return err({ code: 'FORM_LOCKED' });
  const cost = evolveCost(form, s.slime, s.stage.highestCleared, cfg);
  if (s.gold < cost) return err({ code: 'NOT_ENOUGH_GOLD', need: cost, have: s.gold });
  return ok({ cost });
}

export function anyFormAvailable(s: ProgressState, cfg: GameConfig): boolean {
  return cfg.forms.some((f) => formStatus(f, s.slime, s.stage.highestCleared) === 'available');
}

/** 진행이 바뀌어 새로 진화할 수 있게 된 형태와 오른 숙련 단계 */
export function diffForms(before: ProgressState, after: ProgressState, cfg: GameConfig): FormChange[] {
  const changes: FormChange[] = [];
  for (const form of cfg.forms) {
    const was = formStatus(form, before.slime, before.stage.highestCleared);
    const now = formStatus(form, after.slime, after.stage.highestCleared);
    if (was === 'locked' && now === 'available') changes.push({ type: 'formAvailable', form: form.id });
  }
  const current = after.slime.form && after.slime.form === before.slime.form ? findForm(cfg, after.slime.form) : undefined;
  if (current) {
    const to = masteryLevel(current, after.slime.absorption);
    for (let level = masteryLevel(current, before.slime.absorption) + 1; level <= to; level++) {
      changes.push({ type: 'masteryUp', form: current.id, level });
    }
  }
  return changes;
}
