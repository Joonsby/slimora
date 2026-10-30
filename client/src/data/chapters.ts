import type { ChapterDef, StageDef } from '../core/model/config';
import type { MonsterId } from '../core/model/ids';

/** chapters.json 한 장 — 스테이지 10개의 이름 · 배경과 등장 몬스터 */
export interface ChapterSource {
  id: number;
  name: string;
  /** 그 장의 일반 몬스터 3종 (박쥐 · 골렘 · 화염 계열 순) */
  pool: MonsterId[];
  boss: { monster: MonsterId; timeLimitMs: number };
  stages: { name: string; scene: string }[];
}

/** 처치 목표 — 장 첫 3스테이지가 기준, 3스테이지마다 +5. 1장만 기준이 낮다 */
const KILLS_FIRST_CHAPTER = 10;
const KILLS_BASE = 15;
const KILLS_STEP = 5;
/** 이 순서(0부터) 이후 스테이지는 세 몬스터가 섞여 나온다. 마지막 스테이지는 보스 */
const MIXED_FROM = 6;

/**
 * 장 데이터를 스테이지 목록으로 편다. 스테이지 번호는 1장 1스테이지부터 빈틈없이 이어진다.
 * 앞 6개는 한 계열씩 번갈아(박쥐 → 골렘 → 화염), 그다음은 섞여서, 마지막은 보스
 */
export function expandChapters(chapters: readonly ChapterSource[]): { chapters: ChapterDef[]; stages: StageDef[] } {
  const stages: StageDef[] = [];
  for (const ch of chapters) {
    const base = ch.id === 1 ? KILLS_FIRST_CHAPTER : KILLS_BASE;
    const mixed = ch.pool.map((monster) => ({ monster, weight: 1 }));
    ch.stages.forEach((st, k) => {
      const last = k === ch.stages.length - 1;
      stages.push({
        id: stages.length + 1,
        chapter: ch.id,
        name: st.name,
        scene: st.scene,
        spawns: k < MIXED_FROM ? [{ monster: ch.pool[k % ch.pool.length]!, weight: 1 }] : mixed,
        killsToClear: last ? base : base + KILLS_STEP * Math.floor(k / 3),
        ...(last ? { boss: ch.boss } : {}),
      });
    });
  }
  return { chapters: chapters.map(({ id, name }) => ({ id, name })), stages };
}
