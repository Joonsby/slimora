import Phaser from 'phaser';
import { sceneArt, type SceneArt } from '../art/backgrounds';
import { monsterSprite } from '../art/monsters';
import { slimeLayers, slimePortrait, SLIME_H, SLIME_W, type SlimePreset } from '../art/slime';
import { dataUrl, linear, radial, svgDoc } from '../art/svg';
import { findStage } from '../core/lookup';
import type { GameConfig } from '../core/model/config';
import type { StageId } from '../core/model/ids';

/** 아트(SVG)를 Phaser 텍스처로 올린다. 키 이름과 몬스터 크기 정보도 여기서 관리한다 */

export const SLIME_PRESETS: readonly SlimePreset[] = [null, 'vampire', 'iron', 'flame'];
const presetKey = (p: SlimePreset) => p ?? 'base';

export const KEY = {
  slimeBody: 'slime-body',
  slimeFace: (p: SlimePreset) => `slime-face-${presetKey(p)}`,
  slimeBlink: (p: SlimePreset) => `slime-blink-${presetKey(p)}`,
  slimeBack: (p: SlimePreset) => `slime-back-${presetKey(p)}`,
  slimeFront: (p: SlimePreset) => `slime-front-${presetKey(p)}`,
  monster: (id: string) => `mon-${id}`,
  mercenary: (id: string) => `merc-${id}`,
  backdrop: (scene: string) => `bg-${scene}-back`,
  ground: (scene: string) => `bg-${scene}-ground`,
  dot: 'fx-dot',
  spark: 'fx-spark',
  coin: 'fx-coin',
  vignette: 'fx-vignette',
  topShade: 'fx-top',
  band: 'fx-band',
} as const;

export interface MonsterMeta {
  /** 디자인 단위 */
  width: number;
  height: number;
  footY: number;
  hover: number;
}

/** 디자인 단위 1 을 몇 픽셀로 굽는지. 화면 배율이 높을수록 크게 */
export const textureRes = (dpr: number) => Math.min(4, Math.max(2, Math.ceil(dpr * 1.6)));

const queue = (scene: Phaser.Scene, key: string, svg: string) => {
  if (!scene.textures.exists(key)) scene.load.image(key, dataUrl(svg));
};

/** preload 에서 — 슬라임 층 · 용병 · 효과. 몬스터는 크기 정보만 모두 만들고, 그림은 스테이지마다 queueMonsters 로 굽는다 */
export function queueCoreTextures(scene: Phaser.Scene, config: GameConfig, res: number): Map<string, MonsterMeta> {
  for (const preset of SLIME_PRESETS) {
    const layers = slimeLayers(preset, res);
    if (preset === null) queue(scene, KEY.slimeBody, layers.body.svg);
    queue(scene, KEY.slimeFace(preset), layers.face.svg);
    queue(scene, KEY.slimeBlink(preset), layers.blink.svg);
    if (layers.back) queue(scene, KEY.slimeBack(preset), layers.back.svg);
    if (layers.front) queue(scene, KEY.slimeFront(preset), layers.front.svg);
  }
  const meta = new Map<string, MonsterMeta>();
  for (const def of config.monsters) {
    const sprite = monsterSprite(def.visual.preset, def.visual.tint, res);
    meta.set(def.id, { width: sprite.width, height: sprite.height, footY: sprite.footY, hover: sprite.hover });
  }
  for (const def of config.mercenaries) {
    const sprite = def.look.preset === 'slime' ? { svg: slimePortrait(def.look.tint, null, res), width: SLIME_W, height: SLIME_H } : monsterSprite(def.look.preset, def.look.tint, res);
    queue(scene, KEY.mercenary(def.id), sprite.svg);
  }
  queue(scene, KEY.dot, svgDoc(64, 64, `<defs>${radial('d', [[0, '#fff'], [0.35, '#fff', 0.8], [1, '#fff', 0]])}</defs><circle cx="32" cy="32" r="32" fill="url(#d)"/>`));
  queue(
    scene,
    KEY.spark,
    svgDoc(64, 64, `<defs>${radial('s', [[0, '#fff', 0.9], [1, '#fff', 0]])}</defs><circle cx="32" cy="32" r="18" fill="url(#s)"/><path d="M32 2 L36 28 L62 32 L36 36 L32 62 L28 36 L2 32 L28 28 Z" fill="#fff"/>`),
  );
  queue(
    scene,
    KEY.coin,
    svgDoc(48, 48, `<defs>${linear('c', [[0, '#ffe58a'], [1, '#f0a400']])}</defs><circle cx="24" cy="24" r="21" fill="url(#c)" stroke="#9a5a00" stroke-width="3"/><circle cx="24" cy="24" r="13" fill="none" stroke="#c77d00" stroke-width="2.5"/><path d="M18 14 Q 22 12 24 16" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`),
  );
  queue(scene, KEY.vignette, svgDoc(256, 256, `<defs>${radial('v', [[0.45, '#000', 0], [1, '#000', 0.78]], 0.5, 0.5, 0.72)}</defs><rect width="256" height="256" fill="url(#v)"/>`));
  queue(scene, KEY.topShade, svgDoc(8, 256, `<defs>${linear('t', [[0, '#000', 0.62], [1, '#000', 0]])}</defs><rect width="8" height="256" fill="url(#t)"/>`));
  queue(scene, KEY.band, svgDoc(512, 64, `<defs>${linear('b', [[0, '#000', 0], [0.25, '#000', 0.6], [0.75, '#000', 0.6], [1, '#000', 0]], 1, 0)}</defs><rect width="512" height="64" fill="url(#b)"/>`));
  return meta;
}

const sceneCache = new Map<string, SceneArt>();

/** 배경 장면. 같은 장면은 한 번만 만든다 (res 는 처음 만들 때 기준) */
export function sceneInfo(key: string, res: number): SceneArt {
  let art = sceneCache.get(key);
  if (!art) {
    art = sceneArt(key, res);
    sceneCache.set(key, art);
  }
  return art;
}

/** 그 스테이지에 나오는 몬스터 (보스 포함) */
export function stageMonsters(config: GameConfig, stageId: StageId): string[] {
  const stage = findStage(config, stageId);
  return [...stage.spawns.map((s) => s.monster), ...(stage.boss ? [stage.boss.monster] : [])];
}

/** 몬스터 텍스처를 큐에 넣는다. 넣은 게 있으면 true */
export function queueMonsters(scene: Phaser.Scene, config: GameConfig, ids: readonly string[], res: number): boolean {
  let queued = false;
  for (const id of ids) {
    const def = config.monsters.find((m) => m.id === id);
    if (!def || scene.textures.exists(KEY.monster(id))) continue;
    queue(scene, KEY.monster(id), monsterSprite(def.visual.preset, def.visual.tint, res).svg);
    queued = true;
  }
  return queued;
}

/** 배경 텍스처를 큐에 넣는다. 이미 있으면 false */
export function queueScene(scene: Phaser.Scene, key: string, res: number): boolean {
  if (scene.textures.exists(KEY.backdrop(key))) return false;
  const art = sceneInfo(key, res);
  scene.load.image(KEY.backdrop(key), dataUrl(art.backdrop.svg));
  scene.load.image(KEY.ground(key), dataUrl(art.ground.svg));
  return true;
}
