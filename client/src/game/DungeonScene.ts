import Phaser from 'phaser';
import { monsterSprite } from '../art/monsters';
import type { SlimePreset } from '../art/slime';
import { slimeTint } from '../art/slimeColor';
import { findMonster } from '../core/lookup';
import type { DamageSource, DungeonEvent, DungeonMonster, DungeonState } from '../core/model/dungeon';
import { findForm } from '../core/progression/forms';
import type { GameSession, SessionEvent } from '../session/GameSession';
import { DUNGEON_SCENE, dungeonMonsters, KEY, queueCoreTextures, queueMonsters, queueScene, sceneInfo, textureRes, type MonsterMeta } from './assets';
import { DamageTextPool, FONT_FAMILY } from './DamageTextPool';
import { SlimeView } from './SlimeView';

interface Layout {
  w: number;
  h: number;
  unit: number;
  groundY: number;
  slimeX: number;
  /** 맨 앞 자리 x · 자리 간격 */
  frontX: number;
  gapX: number;
  gapY: number;
}

interface MonsterView {
  seq: number;
  defId: string;
  sprite: Phaser.GameObjects.Image;
  slot: number;
  boss: boolean;
  idle: Phaser.Tweens.Tween | null;
  /** 맞아 번쩍인 뒤 돌아갈 색 (격노 · 경화 · 예고). null 이면 원래 색 */
  tint: number | null;
}

interface Bolt {
  points: { x: number; y: number }[];
  color: number;
  width: number;
  until: number;
}

/**
 * 대열 자리를 화면에 놓는 위치 [앞뒤, 깊이]. 엔진의 SLOTS 와 같은 순서 · 비슷한 모양이되, 좁은 화면에서 덜 겹치게 깊이를 더 벌린다.
 * 깊이가 클수록(앞) 아래에 크게, 작을수록(뒤) 위에 작게
 */
const VIEW_SLOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.95, -0.8],
  [0.95, 0.8],
  [1.9, -0.35],
  [1.9, 0.9],
];

const SLIME_SCALE = 0.9;
const SLIME_TOP = 108;
/** 디자인 크기에 곱하는 몬스터 크기. 여럿이 서야 해서 사냥터보다 작다 */
const MONSTER_SCALE = 0.44;
const BOSS_SCALE = 0.82;
const BANNER_MS = 1300;
const ALLY_WIDTH: Record<string, number> = { slime: 54, bat: 60, golem: 48, dragon: 62 };
const DEPTH = { sky: 0, backdrop: 1, ground: 2, tint: 3, shadow: 4, warn: 5, monster: 6, slime: 30, fx: 40, ambient: 45, vignette: 50, bars: 52, text: 60, banner: 70 };
const SOURCE_STYLE: Partial<Record<DamageSource, { color: string; size: number }>> = {
  split: { color: '#a8f5bd', size: 16 },
  explosion: { color: '#ffa25c', size: 19 },
  lightning: { color: '#aee6ff', size: 18 },
  poison: { color: '#c4f57a', size: 14 },
  burn: { color: '#ff9a3c', size: 14 },
  splash: { color: '#ffc08a', size: 15 },
  ally: { color: '#8fe9ff', size: 15 },
  thorns: { color: '#d8dfeb', size: 16 },
  shockwave: { color: '#7feaff', size: 19 },
};

/** 도전 던전 장면. 계산은 하지 않고 던전 이벤트와 읽기 전용 뷰를 그린다 */
export class DungeonScene extends Phaser.Scene {
  private layout: Layout = computeLayout(360, 640, 1);
  private texRes = 2;
  private readonly meta = new Map<string, MonsterMeta>();
  private slime!: SlimeView;
  private slimeColor = 0xffffff;
  private formPreset: SlimePreset = null;
  private readonly monsters = new Map<number, MonsterView>();
  private allies: Phaser.GameObjects.Image[] = [];
  private sky!: Phaser.GameObjects.Rectangle;
  private backdrop!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.Image;
  private groundFill!: Phaser.GameObjects.Rectangle;
  private gloom!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Image;
  private shadows!: Phaser.GameObjects.Graphics;
  private warn!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private texts!: DamageTextPool;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private slimeLunge: Phaser.Tweens.Tween | null = null;
  private readonly bannerQueue: { text: string; color: string; size: number }[] = [];
  private bannerBusy = false;
  private bolts: Bolt[] = [];
  /** 회복 숫자는 모아서 보여 준다 */
  private healPending = 0;
  private healShownAt = 0;
  private hpLag = 1;
  private frenzy = 0;
  /** 지금 그리는 판 — 바뀌면 화면을 비운다 */
  private run: Readonly<DungeonState> | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly session: GameSession,
    private readonly dpr: number,
  ) {
    super('dungeon');
  }

  preload(): void {
    this.texRes = textureRes(this.dpr);
    // 사냥터가 다 굽기 전에 들어왔을 수 있다 — 이미 있는 그림은 건너뛴다
    queueCoreTextures(this, this.session.config, this.texRes);
    queueScene(this, DUNGEON_SCENE, this.bgRes());
    this.queueRunMonsters();
  }

  create(): void {
    this.sky = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0).setDepth(DEPTH.sky);
    this.backdrop = this.add.image(0, 0, KEY.backdrop(DUNGEON_SCENE)).setOrigin(0.5, 1).setDepth(DEPTH.backdrop);
    this.ground = this.add.image(0, 0, KEY.ground(DUNGEON_SCENE)).setOrigin(0.5, 0).setDepth(DEPTH.ground);
    this.groundFill = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0).setDepth(DEPTH.ground);
    this.gloom = this.add.rectangle(0, 0, 1, 1, 0x2a1050, 0.38).setOrigin(0).setDepth(DEPTH.tint);
    this.shadows = this.add.graphics().setDepth(DEPTH.shadow);
    this.warn = this.add.graphics().setDepth(DEPTH.warn);
    this.slime = new SlimeView(this);
    this.slime.root.setDepth(DEPTH.slime);
    this.fx = this.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.vignette = this.add.image(0, 0, KEY.vignette).setOrigin(0).setDepth(DEPTH.vignette).setAlpha(0.95);
    this.bars = this.add.graphics().setDepth(DEPTH.bars);
    this.bannerText = this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, stroke: '#1a1026', strokeThickness: 8 }).setOrigin(0.5);
    this.bannerText.setShadow(0, 4, 'rgba(0,0,0,0.5)', 6, true, true);
    this.banner = this.add.container(0, 0, [this.add.image(0, 0, KEY.band).setOrigin(0.5), this.bannerText]).setDepth(DEPTH.banner).setAlpha(0);
    this.texts = new DamageTextPool(this);

    this.relayout(this.scale.width, this.scale.height);
    this.syncRun();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.syncRun, this);
    this.unsubscribe = [this.session.onDungeonEvents((e) => this.onDungeonEvents(e)), this.session.onEvents((e) => this.onSessionEvents(e))];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(time: number, delta: number): void {
    this.session.tick(delta);
    this.drawFrame(time, delta);
  }

  private cleanup(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.off(Phaser.Scenes.Events.WAKE, this.syncRun, this);
    this.slime?.destroy();
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.relayout(size.width, size.height);
  }

  // ── 판 · 배치 ───────────────────────────────────────────

  /** 새 판이면 화면을 비우고 슬라임 · 용병 · 남아 있는 적을 뷰대로 다시 놓는다 */
  private syncRun(): void {
    const view = this.session.dungeonView();
    if (view === this.run) return;
    this.run = view;
    for (const m of [...this.monsters.values()]) this.removeMonster(m.seq, false);
    this.bolts = [];
    this.bannerQueue.length = 0;
    this.hpLag = 1;
    this.frenzy = 0;
    this.refreshSlimeLook();
    this.slime.root.setAlpha(1);
    this.startIdle();
    this.syncAllies();
    if (!view) return;
    this.queueRunMonsters();
    for (const m of view.monsters) this.showMonster(m.seq, m.defId, m.slot, m.boss !== null, false);
    this.queueBanner(`도전 던전 ${view.level}단계`, '#d9c4ff', 30);
  }

  /** 이 판에 나올 몬스터 그림 (기준 스테이지가 속한 장 + 보스 + 부하) */
  private queueRunMonsters(): boolean {
    const { config } = this.session;
    const view = this.session.dungeonView();
    if (!view) return false;
    const chapter = config.stages.find((s) => s.id === view.refStage)?.chapter;
    const ids = new Set<string>();
    for (const st of config.stages) if (st.chapter === chapter) for (const sp of st.spawns) ids.add(sp.monster);
    for (const id of dungeonMonsters(config)) ids.add(id);
    const queued = queueMonsters(this, config, [...ids], this.texRes);
    if (queued && !this.load.isLoading() && this.sys.isActive()) this.load.start();
    return queued;
  }

  private bgRes(): number {
    const w = this.scale?.width || 720;
    return Math.min(2.5, Math.max(1, Math.ceil((w / 540) * 2) / 2));
  }

  private relayout(w: number, h: number): void {
    this.layout = computeLayout(w, h, this.dpr);
    const { unit, groundY } = this.layout;
    const art = sceneInfo(DUNGEON_SCENE, this.bgRes());
    this.backdrop.setPosition(w / 2, groundY + 2).setScale(w / this.backdrop.width);
    this.ground.setPosition(w / 2, groundY).setScale(w / this.ground.width);
    const skyBottom = groundY - this.backdrop.displayHeight + 2;
    this.sky.setFillStyle(hex(art.top)).setSize(w, Math.max(1, skyBottom));
    const groundEnd = groundY + this.ground.displayHeight - 1;
    this.groundFill.setFillStyle(hex(art.bottom)).setSize(w, Math.max(1, h - groundEnd)).setPosition(0, groundEnd);
    this.gloom.setSize(w, h);
    this.cameras.main.setBackgroundColor(art.top);
    this.vignette.setDisplaySize(w, h);
    this.bannerText.setFontSize(Math.round(30 * unit)).setStroke('#1a1026', Math.round(7 * unit));
    this.banner.setPosition(w / 2, h * 0.34);
    (this.banner.list[0] as Phaser.GameObjects.Image).setDisplaySize(w, 64 * unit);
    this.createEmitters();
    for (const m of this.monsters.values()) this.placeMonster(m);
    this.startIdle();
    this.syncAllies();
  }

  private createEmitters(): void {
    const u = this.layout.unit;
    this.burst?.destroy();
    this.sparks?.destroy();
    this.ambient?.destroy();
    this.burst = this.add
      .particles(0, 0, KEY.dot, { emitting: false, speed: { min: 60 * u, max: 260 * u }, lifespan: { min: 320, max: 640 }, scale: { start: (24 * u) / 64, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD })
      .setDepth(DEPTH.fx);
    this.sparks = this.add
      .particles(0, 0, KEY.spark, { emitting: false, speed: { min: 80 * u, max: 240 * u }, lifespan: { min: 140, max: 300 }, scale: { start: (28 * u) / 64, end: 0 }, rotate: { min: 0, max: 90 }, blendMode: Phaser.BlendModes.ADD })
      .setDepth(DEPTH.fx);
    const { w, groundY } = this.layout;
    this.ambient = this.add
      .particles(0, 0, KEY.dot, {
        x: { min: 0, max: w },
        y: { min: groundY * 0.2, max: groundY },
        lifespan: { min: 3500, max: 6000 },
        speedY: { min: -16 * u, max: -4 * u },
        speedX: { min: -8 * u, max: 8 * u },
        scale: { start: (9 * u) / 64, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xb48cff, 0x7f5cff],
        frequency: 240,
        maxAliveParticles: 22,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH.ambient);
    this.ambient.fastForward(3000);
  }

  private slimeScale(): number {
    return (this.layout.unit * SLIME_SCALE) / this.texRes;
  }

  private startIdle(): void {
    const root = this.slime.root;
    this.tweens.killTweensOf(root);
    this.slimeLunge = null;
    const s = this.slimeScale();
    root.setPosition(this.layout.slimeX, this.layout.groundY).setScale(s);
    this.idleTween = this.tweens.add({ targets: root, scaleX: s * 1.05, scaleY: s * 0.93, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private refreshSlimeLook(): void {
    const { config } = this.session;
    const slime = this.session.getProgress().slime;
    const form = slime.form ? findForm(config, slime.form) : undefined;
    this.formPreset = (form?.visual.preset ?? null) as SlimePreset;
    this.slimeColor = form ? hex(form.visual.tint) : slimeTint(slime.absorption, config.families);
    this.slime.setLook(this.formPreset, this.slimeColor);
  }

  private syncAllies(): void {
    for (const a of this.allies) {
      this.tweens.killTweensOf(a);
      a.destroy();
    }
    const { config } = this.session;
    const { unit, groundY, slimeX } = this.layout;
    this.allies = this.session.getProgress().mercenaries.party.flatMap((id, i) => {
      const def = config.mercenaries.find((m) => m.id === id);
      if (!def || !this.textures.exists(KEY.mercenary(id))) return [];
      const x = Math.max(30 * unit, slimeX + (i === 0 ? -44 : 40) * unit);
      const y = groundY - (i === 0 ? 150 : 166) * unit;
      const img = this.add.image(x, y, KEY.mercenary(id)).setDepth(DEPTH.slime + 1);
      img.setScale(((ALLY_WIDTH[def.look.preset] ?? 56) * unit) / img.width);
      this.tweens.add({ targets: img, y: y - 7 * unit, duration: 800 + i * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 300 });
      return [img];
    });
  }

  private monsterMeta(defId: string): MonsterMeta {
    let m = this.meta.get(defId);
    if (!m) {
      const def = findMonster(this.session.config, defId);
      const sprite = monsterSprite(def.visual.preset, def.visual.tint, 1);
      m = { width: sprite.width, height: sprite.height, footY: sprite.footY, hover: sprite.hover };
      this.meta.set(defId, m);
    }
    return m;
  }

  /** 자리의 발 위치. 보스는 크니 조금 뒤로 */
  private slotPos(slot: number, boss: boolean): { x: number; y: number } {
    const [sx, sy] = VIEW_SLOTS[slot] ?? [0, 0];
    const { frontX, gapX, gapY, groundY } = this.layout;
    return { x: frontX + sx * gapX + (boss ? gapX * 0.45 : 0), y: groundY + sy * gapY };
  }

  private monsterScale(defId: string, boss: boolean, slot = 0): number {
    const def = findMonster(this.session.config, defId);
    const meta = this.monsterMeta(defId);
    const depth = boss ? 1 : 1 + 0.08 * (VIEW_SLOTS[slot]?.[1] ?? 0);
    const want = def.visual.scale * (boss ? BOSS_SCALE : MONSTER_SCALE) * depth * this.layout.unit;
    const cap = (this.layout.w * (boss ? 0.42 : 0.2)) / meta.width;
    return Math.min(want, cap) / this.texRes;
  }

  private placeMonster(m: MonsterView): void {
    const p = this.slotPos(m.slot, m.boss);
    const meta = this.monsterMeta(m.defId);
    const s = this.monsterScale(m.defId, m.boss, m.slot);
    m.idle?.stop();
    m.sprite.setPosition(p.x, p.y - meta.hover * s * this.texRes * 0.7).setScale(s).setDepth(DEPTH.monster + (p.y / this.layout.h) * 10);
    m.idle = meta.hover
      ? this.tweens.add({ targets: m.sprite, y: m.sprite.y - 6 * this.layout.unit, duration: 650 + m.slot * 60, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      : this.tweens.add({ targets: m.sprite, scaleY: s * 1.04, scaleX: s * 0.98, duration: 820 + m.slot * 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private showMonster(seq: number, defId: string, slot: number, boss: boolean, animate: boolean): void {
    if (this.monsters.has(seq)) return;
    if (!this.textures.exists(KEY.monster(defId))) {
      queueMonsters(this, this.session.config, [defId], this.texRes);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.session.dungeonView()?.monsters.some((m) => m.seq === seq)) this.showMonster(seq, defId, slot, boss, animate);
      });
      if (!this.load.isLoading()) this.load.start();
      return;
    }
    const meta = this.monsterMeta(defId);
    const sprite = this.add.image(0, 0, KEY.monster(defId)).setOrigin(0.5, meta.footY / meta.height);
    sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const focus = this.session.dungeonView()?.focus;
      this.session.focusMonster(focus === seq ? null : seq);
    });
    const view: MonsterView = { seq, defId, sprite, slot, boss, idle: null, tint: null };
    this.monsters.set(seq, view);
    this.placeMonster(view);
    if (!animate) return;
    const { x, y } = sprite;
    const s = sprite.scaleX;
    view.idle?.pause();
    sprite.setPosition(x + 70 * this.layout.unit, y).setAlpha(0).setScale(s * 0.6);
    this.tweens.add({ targets: sprite, x, alpha: 1, scaleX: s, scaleY: s, duration: boss ? 520 : 300, ease: 'Back.easeOut', onComplete: () => view.idle?.resume() });
    if (boss) {
      this.cameras.main.shake(380, 0.009);
      this.cameras.main.flash(260, 120, 30, 30);
      this.ring(x, y - 40 * this.layout.unit, 0xff5a5a, 4);
    }
  }

  /** 쓰러지면 하얗게 번쩍 → 부풀며 흩어진다 */
  private removeMonster(seq: number, animate: boolean, family?: string): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    this.monsters.delete(seq);
    m.idle?.stop();
    this.tweens.killTweensOf(m.sprite);
    m.sprite.disableInteractive();
    if (!animate) {
      m.sprite.destroy();
      return;
    }
    const { x, y } = m.sprite;
    const top = m.sprite.getTopCenter().y;
    const color = hex(this.familyColor(family ?? ''));
    m.sprite.setTintFill(0xffffff);
    this.burst?.setParticleTint(color);
    this.burst?.explode(m.boss ? 40 : 14, x, (y + top) / 2);
    this.tweens.add({
      targets: m.sprite,
      alpha: 0,
      scaleX: m.sprite.scaleX * 1.3,
      scaleY: m.sprite.scaleY * 0.15,
      duration: m.boss ? 520 : 260,
      ease: 'Quad.easeIn',
      onComplete: () => m.sprite.destroy(),
    });
  }

  // ── 이벤트 ──────────────────────────────────────────────

  private onSessionEvents(events: readonly SessionEvent[]): void {
    for (const e of events) {
      if (e.type === 'dungeonStarted') this.syncRun();
    }
  }

  private onDungeonEvents(events: readonly DungeonEvent[]): void {
    if (this.session.dungeonView() !== this.run) this.syncRun();
    const { config } = this.session;
    for (const e of events) {
      switch (e.type) {
        case 'dWave':
          if (e.boss) this.queueBanner(`보스 웨이브 — ${config.dungeon.bosses[e.boss]?.name ?? ''}`, '#ff7b7b', 26);
          else this.queueBanner(`웨이브 ${e.wave}`, '#ffffff', 30);
          break;
        case 'dSpawn':
          this.showMonster(e.seq, e.defId, e.slot, e.boss !== null, true);
          break;
        case 'dAttack':
          this.slimeAttack(e.target, e.split);
          break;
        case 'dMonsterAttack':
          this.monsterLunge(e.seq, 18);
          break;
        case 'dHit':
          this.onHit(e);
          break;
        case 'dHurt':
          this.onHurt(e);
          break;
        case 'dExplosion':
          this.explosion(e.slot, e.radius, e.toxic);
          break;
        case 'dLightning':
          this.lightning(e.path, e.storm, e.mini);
          break;
        case 'dStatus':
          this.statusPuff(e.seq, e.status);
          break;
        case 'dShield': {
          const { slimeX, groundY, unit } = this.layout;
          this.ring(slimeX, groundY - 48 * unit, 0x5ee4ff, 2);
          break;
        }
        case 'dShieldBreak':
          this.shieldBreak(e.shockwave, e.flame);
          break;
        case 'dFrenzy':
          if (e.stacks > this.frenzy) this.slimeText(`광폭 ×${e.stacks}`, '#ff6b8a', 17, 50);
          this.frenzy = e.stacks;
          break;
        case 'dHeal':
          this.healPending += e.amount;
          break;
        case 'dKilled':
          this.onKilled(e);
          break;
        case 'dAllyAttack':
          this.allyShot(e.index, e.target);
          break;
        case 'dUltReady': {
          const { slimeX, groundY, unit } = this.layout;
          this.sparks?.setParticleTint(0xffd84a);
          this.sparks?.explode(10, slimeX, groundY - 60 * unit);
          break;
        }
        case 'dUltimate':
          this.ultimate(e.blocked, e.broke, e.weakened);
          break;
        case 'dBossCast':
          this.bossCast(e.seq, e.pattern);
          break;
        case 'dBossImpact':
          this.bossImpact(e.seq, e.pattern, e.weakened);
          break;
        case 'dGuard':
          this.guard(e.seq, e.on);
          break;
        case 'dEnraged': {
          const m = this.monsters.get(e.seq);
          if (m) this.setBaseTint(m, 0xff8f8f);
          this.queueBanner('보스 격노!', '#ff6b6b', 28);
          this.cameras.main.shake(260, 0.006);
          break;
        }
        case 'dWaveClear': {
          const { slimeX, groundY, unit } = this.layout;
          this.ring(slimeX, groundY - 48 * unit, 0x7be495, 2.6);
          this.queueBanner(`웨이브 ${e.wave} 돌파!`, '#7be495', 26);
          break;
        }
        case 'dSkill': {
          const def = config.dungeon.skills[e.skill];
          const { slimeX, groundY, unit } = this.layout;
          const color = hex(def.color);
          this.ring(slimeX, groundY - 50 * unit, color, 3.4);
          this.time.delayedCall(140, () => this.ring(slimeX, groundY - 50 * unit, 0xffffff, 2.4));
          this.burst?.setParticleTint(color);
          this.burst?.explode(22, slimeX, groundY - 50 * unit);
          this.slimeText(`${def.name} ${e.level > 1 ? `Lv ${e.level}` : '획득'}!`, def.color, 22, 66);
          break;
        }
        case 'dSynergy':
          this.queueBanner(`시너지! ${config.dungeon.synergies[e.synergy].name}`, '#ff9ae0', 30);
          this.cameras.main.flash(260, 255, 160, 230);
          break;
        case 'dCleared':
          this.queueBanner('던전 클리어!', '#ffd84a', 34);
          this.celebrate();
          break;
        case 'dFailed':
          this.idleTween?.stop();
          this.tweens.add({ targets: this.slime.root, scaleY: this.slimeScale() * 0.3, alpha: 0.5, duration: 320, ease: 'Quad.easeIn' });
          this.queueBanner('쓰러졌다…', '#c7b3ff', 30);
          break;
        case 'dOffer':
          break;
      }
    }
  }

  private onHit(e: Extract<DungeonEvent, { type: 'dHit' }>): void {
    const m = this.monsters.get(e.seq);
    if (!m) return;
    const top = m.sprite.getTopCenter().y;
    const x = m.sprite.x;
    let style = SOURCE_STYLE[e.source] ?? { color: '#ffffff', size: 19 };
    let text = String(e.amount);
    let pop = false;
    if (e.source === 'ultimate') {
      style = { color: '#ffe27a', size: 30 };
      text = `${e.amount}!!`;
      pop = true;
    } else if (e.crit) {
      style = { color: '#ffd84a', size: 28 };
      text = `${e.amount}!`;
      pop = true;
      this.cameras.main.shake(80, 0.003);
      this.sparks?.setParticleTint(0xfff3b0);
      this.sparks?.explode(8, x, top + 20 * this.layout.unit);
    }
    this.texts.show(x, top - 10 * this.layout.unit, text, { color: style.color, size: this.px(style.size), pop });
    if (e.source === 'poison' || e.source === 'burn') return;
    // 맞으면 하얗게 번쩍 + 뒤로 밀림
    m.sprite.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (this.monsters.get(e.seq) === m) this.restoreTint(m);
    });
    if (e.source === 'hit' || e.source === 'split' || e.crit) {
      const push = (e.crit ? 12 : 6) * this.layout.unit;
      this.tweens.add({ targets: m.sprite, x: x + push, duration: 50, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  private onHurt(e: Extract<DungeonEvent, { type: 'dHurt' }>): void {
    const p = this.slimeAnchor();
    if (e.absorbed > 0) this.texts.show(p.x - this.px(18), p.y, `막음 ${e.absorbed}`, { color: '#7feaff', size: this.px(15) });
    if (e.amount <= 0) return;
    const heavy = e.heavy || e.source === 'smash' || e.source === 'breath';
    this.texts.show(p.x, p.y, heavy ? `${e.amount}!!` : String(e.amount), { color: heavy ? '#ff3b3b' : e.source === 'burn' ? '#ff9a3c' : '#ff7b7b', size: this.px(heavy ? 30 : e.source === 'burn' ? 14 : 18), pop: heavy });
    if (e.source !== 'burn') this.slime.flash();
    if (heavy) {
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.flash(160, 160, 20, 20);
    }
  }

  private onKilled(e: Extract<DungeonEvent, { type: 'dKilled' }>): void {
    const m = this.monsters.get(e.seq);
    if (m) {
      const { x } = m.sprite;
      const top = m.sprite.getTopCenter().y;
      this.texts.show(x, top - this.px(4), `+${e.gold} G`, { color: '#ffd84a', size: this.px(e.boss ? 24 : 16), pop: e.boss });
      this.absorbOrbs(x, top + 20 * this.layout.unit, e.family, e.boss ? 8 : 2);
    }
    this.removeMonster(e.seq, true, e.family);
    if (e.boss) {
      this.queueBanner('보스 처치!', '#ffd84a', 32);
      this.cameras.main.flash(300, 255, 240, 200);
      this.cameras.main.shake(400, 0.01);
    }
  }

  // ── 슬라임 공격 · 스킬 연출 ─────────────────────────────

  private slimeAttack(target: number, split: readonly number[]): void {
    const root = this.slime.root;
    const { slimeX, unit, groundY } = this.layout;
    this.slimeLunge?.stop();
    root.x = slimeX;
    this.slimeLunge = this.tweens.add({ targets: root, x: slimeX + 22 * unit, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    const from = { x: slimeX + 30 * unit, y: groundY - 46 * unit };
    this.projectile(from, target, this.slimeColor, 20);
    split.forEach((seq, i) => this.time.delayedCall(30 + i * 25, () => this.projectile(from, seq, 0x7be495, 15)));
  }

  /** 젤리 탄 — 쏘는 순간 날아가 터진다 (피해 숫자는 엔진 시각에 바로 뜬다) */
  private projectile(from: { x: number; y: number }, seq: number, color: number, size: number): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    const to = { x: m.sprite.x - 12 * this.layout.unit, y: (m.sprite.y + m.sprite.getTopCenter().y) / 2 };
    const orb = this.add.image(from.x, from.y, KEY.dot).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale((size * this.layout.unit) / 64);
    this.tweens.add({
      targets: orb,
      x: to.x,
      y: to.y,
      duration: 110,
      ease: 'Quad.easeIn',
      onComplete: () => {
        orb.destroy();
        this.sparks?.setParticleTint(color);
        this.sparks?.explode(3, to.x, to.y);
      },
    });
  }

  private explosion(slot: number, radius: number, toxic: boolean): void {
    const p = this.slotPos(slot, false);
    const { unit, gapX } = this.layout;
    const y = p.y - 34 * unit;
    const color = toxic ? 0xa3e635 : 0xff7b39;
    const r = Math.max(36 * unit, radius * gapX * 0.9);
    const disk = this.add.circle(p.x, y, r * 0.3, color, 0.55).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: disk, scale: 3.2, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => disk.destroy() });
    const ring = this.add.circle(p.x, y, r * 0.35).setStrokeStyle(6 * unit, toxic ? 0xff7b39 : 0xffd84a).setDepth(DEPTH.fx);
    this.tweens.add({ targets: ring, scale: 2.9, alpha: 0, duration: 440, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    this.burst?.setParticleTint(color);
    this.burst?.explode(18, p.x, y);
    this.cameras.main.shake(120, 0.004);
  }

  private lightning(path: readonly number[], storm: boolean, mini: boolean): void {
    const { slimeX, groundY, unit } = this.layout;
    const points = path.flatMap((seq) => {
      const m = this.monsters.get(seq);
      return m ? [{ x: m.sprite.x, y: (m.sprite.y + m.sprite.getTopCenter().y) / 2 }] : [];
    });
    if (points.length === 0) return;
    if (!mini) points.unshift({ x: slimeX + 20 * unit, y: groundY - 70 * unit });
    this.bolts.push({ points, color: storm ? 0xff6bd5 : 0x9fe4ff, width: (mini ? 2 : 3.5) * unit, until: this.time.now + (mini ? 140 : 220) });
    for (const p of points.slice(mini ? 1 : 1)) {
      this.sparks?.setParticleTint(storm ? 0xffa3e8 : 0xcff2ff);
      this.sparks?.explode(mini ? 2 : 5, p.x, p.y);
    }
  }

  private statusPuff(seq: number, status: 'poison' | 'burn' | 'stun'): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    const color = status === 'poison' ? 0xa3e635 : status === 'burn' ? 0xff7b39 : 0xffe14a;
    this.burst?.setParticleTint(color);
    this.burst?.explode(6, m.sprite.x, m.sprite.getTopCenter().y + 14 * this.layout.unit);
  }

  private shieldBreak(shockwave: boolean, flame: boolean): void {
    const { slimeX, groundY, unit } = this.layout;
    const y = groundY - 48 * unit;
    this.sparks?.setParticleTint(0x7feaff);
    this.sparks?.explode(16, slimeX, y);
    this.slimeText('보호막 파괴', '#7feaff', 15, 40);
    if (shockwave) {
      const ring = this.add.circle(slimeX, y, 40 * unit).setStrokeStyle(8 * unit, 0x5ee4ff).setDepth(DEPTH.fx);
      this.tweens.add({ targets: ring, scale: 9, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      this.cameras.main.shake(180, 0.006);
    }
    if (flame) {
      const ring = this.add.circle(slimeX, y, 40 * unit).setStrokeStyle(12 * unit, 0xff7b39).setDepth(DEPTH.fx);
      this.tweens.add({ targets: ring, scale: 8, alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      this.burst?.setParticleTint(0xff7b39);
      this.burst?.explode(30, slimeX + 80 * unit, y);
    }
  }

  private allyShot(index: number, seq: number): void {
    const ally = this.allies[index];
    if (!ally) return;
    this.tweens.add({ targets: ally, x: ally.x + 10 * this.layout.unit, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    this.projectile({ x: ally.x, y: ally.y }, seq, 0x8fe9ff, 18);
  }

  /** 필살기 — 화면 번쩍 · 슬라임이 솟았다 내려찍고 젤리 파도가 적 전체를 덮친다 */
  private ultimate(blocked: boolean, broke: boolean, weakened: boolean): void {
    const { slimeX, groundY, unit, w } = this.layout;
    const s = this.slimeScale();
    this.idleTween?.pause();
    this.tweens.add({
      targets: this.slime.root,
      y: groundY - 40 * unit,
      scaleX: s * 0.9,
      scaleY: s * 1.15,
      duration: 140,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.startIdle(),
    });
    this.cameras.main.flash(240, 255, 236, 170);
    this.cameras.main.shake(420, 0.014);
    const wave = this.add.ellipse(slimeX, groundY - 30 * unit, 60 * unit, 140 * unit, this.slimeColor, 0.55).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: wave, x: w + 80 * unit, scaleX: 3.5, alpha: 0.15, duration: 420, ease: 'Cubic.easeIn', onComplete: () => wave.destroy() });
    for (const m of this.monsters.values()) {
      this.time.delayedCall(Math.max(0, ((m.sprite.x - slimeX) / w) * 360), () => {
        this.burst?.setParticleTint(0xffe27a);
        this.burst?.explode(12, m.sprite.x, m.sprite.y - 30 * unit);
      });
    }
    if (blocked) this.queueBanner('차단!', '#ffe27a', 36);
    if (broke) this.queueBanner('경화 파괴!', '#ffe27a', 32);
    if (weakened) this.queueBanner('숨결 약화!', '#ffe27a', 30);
  }

  private bossCast(seq: number, pattern: string): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    const name = { smash: '내려찍기', breath: '화염 숨결', guard: '경화', summon: '부하 소환' }[pattern] ?? '';
    this.texts.show(m.sprite.x, m.sprite.getTopCenter().y - this.px(22), `${name}!`, { color: '#ff5a5a', size: this.px(22), pop: true });
    this.setBaseTint(m, 0xff7070);
    this.tweens.add({ targets: m.sprite, x: m.sprite.x + 4 * this.layout.unit, duration: 45, yoyo: true, repeat: 5 });
  }

  private bossImpact(seq: number, pattern: string, weakened: boolean): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    this.setBaseTint(m, this.bossTint(seq));
    const { slimeX, groundY, unit } = this.layout;
    if (pattern === 'smash') {
      this.monsterLunge(seq, 60);
      const ring = this.add.ellipse(slimeX, groundY + 4 * unit, 120 * unit, 36 * unit).setStrokeStyle(6 * unit, 0xffc58a).setDepth(DEPTH.fx);
      this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      this.burst?.setParticleTint(0xc9a27a);
      this.burst?.explode(20, slimeX, groundY);
    } else if (pattern === 'breath') {
      const from = { x: m.sprite.x - 40 * unit, y: m.sprite.getTopCenter().y + 40 * unit };
      for (let i = 0; i < (weakened ? 6 : 16); i++) {
        const flame = this.add.image(from.x, from.y, KEY.dot).setTint(i % 2 ? 0xff7b39 : 0xffd84a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale((26 * unit) / 64);
        this.tweens.add({
          targets: flame,
          x: slimeX + (Math.random() - 0.5) * 40 * unit,
          y: groundY - (20 + Math.random() * 60) * unit,
          scale: (46 * unit) / 64,
          alpha: 0,
          duration: 300,
          delay: i * 18,
          ease: 'Quad.easeIn',
          onComplete: () => flame.destroy(),
        });
      }
    } else if (pattern === 'summon') {
      this.ring(m.sprite.x - 60 * unit, groundY - 20 * unit, 0xb48cff, 3);
    }
  }

  private guard(seq: number, on: boolean): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    if (on) {
      this.setBaseTint(m, 0x9fb3c8);
      this.texts.show(m.sprite.x, m.sprite.getTopCenter().y - this.px(10), '경화!', { color: '#c3d6ea', size: this.px(22), pop: true });
      return;
    }
    this.setBaseTint(m, this.bossTint(seq));
    this.sparks?.setParticleTint(0xdfe9f5);
    this.sparks?.explode(12, m.sprite.x, m.sprite.y - 50 * this.layout.unit);
  }

  private setBaseTint(m: MonsterView, tint: number | null): void {
    m.tint = tint;
    this.restoreTint(m);
  }

  private restoreTint(m: MonsterView): void {
    if (m.tint === null) m.sprite.clearTint();
    else m.sprite.setTint(m.tint);
  }

  /** 예고 · 경화가 끝난 보스의 색 — 격노했으면 붉게 */
  private bossTint(seq: number): number | null {
    const b = this.session.dungeonView()?.monsters.find((m) => m.seq === seq)?.boss;
    if (b && b.guardUntil > (this.session.dungeonView()?.now ?? 0)) return 0x9fb3c8;
    return b?.enraged ? 0xff8f8f : null;
  }

  private monsterLunge(seq: number, distance: number): void {
    const m = this.monsters.get(seq);
    if (!m) return;
    const x = m.sprite.x;
    this.tweens.add({ targets: m.sprite, x: x - distance * this.layout.unit, duration: distance > 30 ? 120 : 80, yoyo: true, ease: 'Quad.easeOut', onComplete: () => m.sprite.setX(x) });
  }

  private absorbOrbs(fromX: number, fromY: number, family: string, count: number): void {
    const { unit, groundY, slimeX } = this.layout;
    const color = hex(this.familyColor(family));
    for (let i = 0; i < count; i++) {
      const orb = this.add.image(fromX, fromY, KEY.dot).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale((16 * unit) / 64);
      this.tweens.add({ targets: orb, x: slimeX, y: groundY - 40 * unit, scale: (6 * unit) / 64, duration: 460, delay: 100 + i * 60, ease: 'Sine.easeIn', onComplete: () => orb.destroy() });
    }
  }

  private celebrate(): void {
    const { w, h } = this.layout;
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 160, () => {
        const tints = [0xffd84a, 0xff9ae0, 0x7be495, 0x8fd8ff];
        this.burst?.setParticleTint(tints[i % tints.length]!);
        this.burst?.explode(26, w * (0.2 + 0.15 * i), h * (0.25 + (i % 2) * 0.12));
      });
    }
    this.cameras.main.flash(400, 255, 230, 150);
  }

  private ring(x: number, y: number, color: number, scale = 3): void {
    const ring = this.add.circle(x, y, 24 * this.layout.unit).setStrokeStyle(5 * this.layout.unit, color).setDepth(DEPTH.fx);
    this.tweens.add({ targets: ring, scale, alpha: 0, duration: 620, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  private slimeText(text: string, color: string, size: number, lift: number): void {
    const p = this.slimeAnchor();
    this.texts.show(p.x, p.y - this.px(lift), text, { color, size: this.px(size), pop: true });
  }

  private slimeAnchor(): { x: number; y: number } {
    const { slimeX, groundY, unit } = this.layout;
    return { x: slimeX, y: groundY - SLIME_TOP * SLIME_SCALE * unit - 24 * unit };
  }

  private familyColor(family: string): string {
    return this.session.config.families.find((f) => f.id === family)?.color ?? '#ffffff';
  }

  private px(css: number): number {
    return Math.round(css * this.layout.unit);
  }

  // ── 배너 ────────────────────────────────────────────────

  private queueBanner(text: string, color: string, size: number): void {
    this.bannerQueue.push({ text, color, size });
    if (!this.bannerBusy) this.playNextBanner();
  }

  private playNextBanner(): void {
    const next = this.bannerQueue.shift();
    if (!next) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    this.bannerText.setText(next.text).setColor(next.color).setFontSize(Math.round(next.size * this.layout.unit));
    this.banner.setAlpha(0).setScale(0.85, 0.6);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' },
        { alpha: 0, duration: 240, delay: BANNER_MS - 440 },
      ],
      onComplete: () => this.playNextBanner(),
    });
  }

  // ── 매 프레임 ───────────────────────────────────────────

  private drawFrame(time: number, delta: number): void {
    const view = this.session.dungeonView();
    const { unit, groundY, slimeX } = this.layout;
    this.shadows.clear();
    this.warn.clear();
    this.fx.clear();
    this.bars.clear();
    if (!view) return;

    if (this.healPending > 0 && time - this.healShownAt > 280) {
      const p = this.slimeAnchor();
      this.texts.show(p.x + this.px(20), p.y + this.px(8), `+${this.healPending}`, { color: '#7be495', size: this.px(15) });
      this.healPending = 0;
      this.healShownAt = time;
    }

    this.shadows.fillStyle(0x000000, 0.4).fillEllipse(slimeX, groundY + 3 * unit, 96 * unit * SLIME_SCALE, 18 * unit * SLIME_SCALE);
    const byseq = new Map(view.monsters.map((m) => [m.seq, m]));
    for (const mv of this.monsters.values()) {
      const m = byseq.get(mv.seq);
      const meta = this.monsterMeta(mv.defId);
      const width = meta.width * mv.sprite.scaleX * this.texRes;
      const pos = this.slotPos(mv.slot, mv.boss);
      const hover = meta.hover ? 0.55 : 1;
      this.shadows.fillStyle(0x000000, 0.38 * hover).fillEllipse(pos.x, pos.y + 3 * unit, width * 0.6 * hover, 15 * unit * hover);
      if (m) this.drawMonsterState(view, m, mv, time);
    }
    this.drawSlime(view, time, delta);
    this.drawBolts(time);
  }

  private drawMonsterState(view: Readonly<DungeonState>, m: Readonly<DungeonMonster>, mv: MonsterView, time: number): void {
    const u = this.layout.unit;
    const g = this.bars;
    const x = mv.sprite.x;
    const top = mv.sprite.getTopCenter().y;
    const pos = this.slotPos(mv.slot, mv.boss);
    // 고른 대상 — 발밑에서 도는 고리
    if (view.focus === m.seq) {
      const r = 26 * u;
      g.lineStyle(3 * u, 0xffe14a, 0.95);
      for (let i = 0; i < 4; i++) {
        const a = time * 0.004 + (i * Math.PI) / 2;
        g.beginPath();
        g.arc(pos.x, pos.y, r, a, a + 0.9);
        g.strokePath();
      }
    }
    if (!m.boss) {
      const width = 54 * u;
      const height = 6 * u;
      const ratio = Phaser.Math.Clamp(m.hp / m.stats.maxHp, 0, 1);
      const y = top - 8 * u;
      g.fillStyle(0x140d1f, 0.8).fillRoundedRect(x - width / 2 - u, y - u, width + 2 * u, height + 2 * u, height / 2);
      g.fillStyle(0xff5a5a).fillRoundedRect(x - width / 2, y, Math.max(height, width * ratio), height, height / 2);
    }
    // 독 · 화상 · 기절 표시
    let iconX = x - 20 * u;
    const iconY = top - (m.boss ? 4 : 18) * u;
    if (m.poison) {
      for (let i = 0; i < Math.min(5, m.poison.stacks); i++) g.fillStyle(0xa3e635, 0.95).fillCircle(iconX + i * 7 * u, iconY - Math.sin(time * 0.01 + i) * 1.5 * u, 3 * u);
      iconX += 40 * u;
    }
    if (m.burn) {
      const flicker = 2.5 * u * Math.sin(time * 0.02);
      g.fillStyle(0xff7b39, 0.95).fillTriangle(iconX - 5 * u, iconY + 3 * u, iconX + 5 * u, iconY + 3 * u, iconX, iconY - 9 * u - flicker);
      g.fillStyle(0xffd84a, 0.95).fillTriangle(iconX - 2.5 * u, iconY + 3 * u, iconX + 2.5 * u, iconY + 3 * u, iconX, iconY - 3 * u - flicker / 2);
    }
    if (m.stunUntil > view.now) {
      for (let i = 0; i < 3; i++) {
        const a = time * 0.008 + (i * Math.PI * 2) / 3;
        g.fillStyle(0xffe14a).fillCircle(x + Math.cos(a) * 14 * u, top - 4 * u + Math.sin(a) * 4 * u, 2.6 * u);
      }
    }
    const b = m.boss;
    if (!b) return;
    // 경화 — 보스를 감싸는 돌빛 막
    if (b.guardUntil > view.now) {
      g.lineStyle(4 * u, 0xc3d6ea, 0.6 + 0.3 * Math.sin(time * 0.012));
      g.strokeEllipse(x, (top + mv.sprite.y) / 2, mv.sprite.displayWidth * 0.95, (mv.sprite.y - top) * 1.05);
    }
    if (b.staggerUntil > view.now) {
      for (let i = 0; i < 4; i++) {
        const a = time * 0.01 + (i * Math.PI) / 2;
        g.fillStyle(0xffffff).fillCircle(x + Math.cos(a) * 24 * u, top - 6 * u + Math.sin(a) * 6 * u, 3 * u);
      }
    }
    const c = b.casting;
    if (!c) return;
    // 패턴 예고 — 슬라임 발밑에 차오르는 경고 원 / 숨결 띠
    const progress = Phaser.Math.Clamp((view.now - c.startedAt) / Math.max(1, c.impactAt - c.startedAt), 0, 1);
    const { slimeX, groundY } = this.layout;
    const w = this.warn;
    const blink = 0.5 + 0.5 * Math.sin(time * 0.03);
    if (c.pattern.kind === 'smash') {
      w.fillStyle(0xff2a2a, 0.15 + 0.15 * blink).fillEllipse(slimeX, groundY + 2 * u, 150 * u, 44 * u);
      w.fillStyle(0xff2a2a, 0.45).fillEllipse(slimeX, groundY + 2 * u, 150 * u * progress, 44 * u * progress);
      w.lineStyle(3 * u, 0xff5a5a, 0.9).strokeEllipse(slimeX, groundY + 2 * u, 150 * u, 44 * u);
    } else if (c.pattern.kind === 'breath') {
      const alpha = (c.weakened ? 0.12 : 0.25) + 0.25 * progress;
      w.fillStyle(0xff7b39, alpha).fillTriangle(x - 30 * u, top + 40 * u, slimeX - 30 * u, groundY - 110 * u * (0.6 + progress * 0.4), slimeX - 30 * u, groundY + 10 * u);
    } else if (c.pattern.kind === 'summon') {
      for (const slot of [1, 2]) {
        const p = this.slotPos(slot, false);
        w.lineStyle(3 * u, 0xb48cff, 0.4 + 0.5 * progress).strokeEllipse(p.x, p.y, 60 * u * progress, 16 * u * progress);
      }
    }
    // 보스 머리 위 느낌표
    this.bars.fillStyle(0xff3b3b, 0.6 + 0.4 * blink).fillCircle(x, top - 30 * u, 11 * u);
    this.bars.fillStyle(0xffffff).fillRect(x - 1.6 * u, top - 37 * u, 3.2 * u, 9 * u).fillCircle(x, top - 24 * u, 1.8 * u);
  }

  private drawSlime(view: Readonly<DungeonState>, time: number, delta: number): void {
    const { unit, groundY, slimeX } = this.layout;
    const s = view.slime;
    const g = this.bars;
    // 광폭 — 붉은 기운
    const frenzy = Math.min(1, s.frenzy / 5);
    if (frenzy > 0) {
      this.fx.fillStyle(0xff3355, 0.12 + 0.18 * frenzy + 0.06 * Math.sin(time * 0.02)).fillEllipse(slimeX, groundY - 40 * unit, (110 + 40 * frenzy) * unit, (110 + 30 * frenzy) * unit);
    }
    // 보호막 — 슬라임을 감싸는 물방울
    if (s.shield > 0) {
      const r = 58 * unit + 2 * unit * Math.sin(time * 0.006);
      this.fx.fillStyle(0x5ee4ff, 0.12).fillCircle(slimeX, groundY - 44 * unit, r);
      this.fx.lineStyle(3 * unit, 0x9ff0ff, 0.7).strokeCircle(slimeX, groundY - 44 * unit, r);
    }
    const width = 84 * unit;
    const height = 10 * unit;
    const top = groundY - SLIME_TOP * SLIME_SCALE * unit - 12 * unit;
    const left = slimeX - width / 2;
    const ratio = Phaser.Math.Clamp(s.hp / s.stats.maxHp, 0, 1);
    this.hpLag = ratio > this.hpLag ? ratio : Math.max(ratio, this.hpLag - delta * 0.0012);
    g.fillStyle(0x140d1f, 0.78).fillRoundedRect(left - 2 * unit, top - 2 * unit, width + 4 * unit, height + 4 * unit, (height + 4 * unit) / 2);
    if (this.hpLag > ratio) g.fillStyle(0xfff1c2, 0.9).fillRoundedRect(left, top, Math.max(height, width * this.hpLag), height, height / 2);
    if (ratio > 0) g.fillStyle(0x5fe08a).fillRoundedRect(left, top, Math.max(height, width * ratio), height, height / 2);
    if (s.shield > 0) {
      const sw = Math.min(width, width * (s.shield / s.stats.maxHp));
      g.fillStyle(0x7feaff, 0.9).fillRoundedRect(left, top - 5 * unit, Math.max(4 * unit, sw), 4 * unit, 2 * unit);
    }
    if (s.burn) {
      for (let i = 0; i < s.burn.stacks; i++) {
        const fx = slimeX + (i - (s.burn.stacks - 1) / 2) * 12 * unit;
        const flicker = 3 * unit * Math.sin(time * 0.02 + i * 1.7);
        g.fillStyle(0xff7b39, 0.95).fillTriangle(fx - 5 * unit, top - 6 * unit, fx + 5 * unit, top - 6 * unit, fx, top - 19 * unit - flicker);
      }
    }
  }

  private drawBolts(time: number): void {
    this.bolts = this.bolts.filter((b) => b.until > time);
    for (const b of this.bolts) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < b.points.length - 1; i++) {
        const a = b.points[i]!;
        const c = b.points[i + 1]!;
        const steps = 5;
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const jitter = k === 0 ? 0 : (Math.random() - 0.5) * 22 * this.layout.unit;
          pts.push({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t + jitter });
        }
      }
      pts.push(b.points[b.points.length - 1]!);
      for (const [width, alpha] of [
        [b.width * 3, 0.3],
        [b.width, 1],
      ] as const) {
        this.fx.lineStyle(width, b.color, alpha);
        this.fx.beginPath();
        this.fx.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts.slice(1)) this.fx.lineTo(p.x, p.y);
        this.fx.strokePath();
      }
    }
  }
}

function hex(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}

/** w · h 는 기기 픽셀. 크기 기준은 CSS 픽셀로 잡고 배율을 곱한다 */
function computeLayout(w: number, h: number, dpr: number): Layout {
  const cssUnit = Phaser.Math.Clamp(Math.min(w / dpr / 390, h / dpr / 620), 0.72, 1.5);
  const unit = cssUnit * dpr;
  return {
    w,
    h,
    unit,
    groundY: Math.round(h * 0.7),
    slimeX: Math.round(Math.max(w * 0.15, 54 * unit)),
    frontX: Math.round(w * 0.45),
    gapX: Math.min(w * 0.2, 86 * unit),
    gapY: 36 * unit,
  };
}
