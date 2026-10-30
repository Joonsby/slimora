/**
 * 장기 진행 시뮬레이터 — 강화 · 진화 · 용병 뽑기 · 환생까지 하는 자동 플레이어로 스테이지 도달 시각을 잰다.
 *   npm run sim:long            (기본: 시드 1개, 전투 ×3 배속, 막히면 20분 뒤 환생)
 *   npm run sim:long -- 400     (최대 400시간까지)
 * 시각은 ×1 배속 기준 전투 시간이다. 실제 플레이는 배속 · 오프라인 보상으로 더 빠르다
 */
import { gameConfig as cfg } from '../src/data';
import { autoPlay } from '../src/dev/autoPlay';

const hours = Number(process.argv[2] ?? 300);
const MILESTONES = [1, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200];

const fmt = (ms: number | undefined) => {
  if (ms === undefined) return '-';
  const m = ms / 60_000;
  return m < 60 ? `${m.toFixed(1)}분` : `${(m / 60).toFixed(1)}시간`;
};

const started = Date.now();
const r = await autoPlay(cfg, {
  maxGameMs: (hours * 3_600_000) / 3,
  retryAfterMs: 30_000,
  stepMs: 250,
  speed: 3,
  seed: 1,
  evolveTo: 'iron',
  recruit: true,
  rebirthWhenStuckMs: 20 * 60_000,
});

console.log(`\n■ 스테이지 첫 클리어 시각 (×1 기준) — 환생 ${r.rebirths}회 · 실패 ${r.failures}회 · 계산 ${((Date.now() - started) / 1000).toFixed(0)}초`);
console.table(MILESTONES.filter((s) => s <= cfg.stages.length).map((s) => ({ 스테이지: s, 장: cfg.stages[s - 1]!.chapter, 시각: fmt(r.firstClearAtMs[s]) })));
