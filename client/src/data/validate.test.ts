import { describe, expect, it } from 'vitest';
import type { EffectSpec } from '../core/model/effects';
import { cloneConfig } from '../testing/fixtures';
import { gameConfig } from '.';
import { validateConfig } from './validate';

describe('validateConfig', () => {
  it('실제 설정에는 오류가 없다', () => {
    expect(validateConfig(gameConfig)).toEqual([]);
  });

  it('깨진 참조 · 범위 · 순서를 잡아낸다', () => {
    const cfg = cloneConfig();
    cfg.monsters[0]!.family = 'ghost';
    cfg.monsters[1]!.effects = [{ kind: 'damageReduction', ratio: 1.5 }];
    cfg.monsters[2]!.effects = [{ kind: 'teleport' } as unknown as EffectSpec];
    cfg.stages[1]!.id = 7;
    cfg.stages[2]!.spawns = [{ monster: 'nobody', weight: 1 }];
    cfg.upgrades[0]!.cost.growth = 1;
    cfg.traits[0]!.tiers[1]!.minAbsorb = 10;
    cfg.traits[1]!.family = 'ghost';

    const errors = validateConfig(cfg).join('\n');
    expect(errors).toContain("없는 계열 'ghost'");
    expect(errors).toContain('effects[0].ratio: 0~1');
    expect(errors).toContain("모르는 효과 'teleport'");
    expect(errors).toContain('stages[1].id');
    expect(errors).toContain("없는 몬스터 'nobody'");
    expect(errors).toContain('cost.growth');
    expect(errors).toContain('traits.bat.tiers[1].minAbsorb: 앞 단계보다 커야 함');
    expect(errors).toContain("traits.ghost: 없는 계열 'ghost'");
  });
});
