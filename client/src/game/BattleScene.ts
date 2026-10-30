import Phaser from 'phaser';
import type { SlimePreset } from '../art/slime';
import { findMonster, findStage } from '../core/lookup';
import type { BattleEvent, Side, UnitState } from '../core/model/battle';
import type { MonsterDef } from '../core/model/config';
import type { StageId } from '../core/model/ids';
import { findForm } from '../core/progression/forms';
import type { GameSession, SessionEvent } from '../session/GameSession';
import { KEY, queueCoreTextures, queueMonsters, queueScene, sceneInfo, stageMonsters, textureRes, type MonsterMeta } from './assets';
import { DamageTextPool, FONT_FAMILY } from './DamageTextPool';
import { slimeTint } from '../art/slimeColor';
import { SlimeView } from './SlimeView';

interface Layout {
  w: number;
  h: number;
  /** 디자인 단위 1 이 몇 기기 픽셀인지 (화면 배율 포함) */
  unit: number;
  groundY: number;
  slimeX: number;
  monsterX: number;
}

/** 슬라임 · 몬스터의 디자인 크기를 화면에서 이만큼 줄여 쓴다 */
const SLIME_SCALE = 0.95;
const MONSTER_SCALE = 0.88;
/** 텍스트 앵커용 슬라임 높이 (디자인 단위, 장식 포함) */
const SLIME_TOP = 108;
const BANNER_MS = 1200;
/** 용병 표시 폭 (디자인 단위) */
const ALLY_WIDTH: Record<string, number> = { slime: 62, bat: 68, golem: 54, dragon: 70 };
/** 배경 그림을 굽는 배율의 상한 — 큰 화면에서도 메모리를 지킨다 */
const MAX_BG_RES = 2.5;

const DEPTH = { sky: 0, backdrop: 1, ground: 2, shadow: 3, monster: 6, slime: 7, fx: 9, ambient: 10, vignette: 20, shade: 21, bars: 22, text: 40, banner: 50 };

/** 전투 장면. 계산은 하지 않고 세션 이벤트와 읽기 전용 뷰를 그린다 */
export class BattleScene extends Phaser.Scene {
  private layout: Layout = computeLayout(360, 640, 1);
  private texRes = 2;
  private monsterMeta = new Map<string, MonsterMeta>();
  private slime!: SlimeView;
  private slimeColor = 0xffffff;
  private formPreset: SlimePreset = null;
  private monster: Phaser.GameObjects.Image | null = null;
  private monsterDef: MonsterDef | null = null;
  private monsterSeq = 0;
  private monsterIdle: Phaser.Tweens.Tween | null = null;
  /** 슬라임 위를 떠다니는 용병 (편성 순서) */
  private allies: Phaser.GameObjects.Image[] = [];
  private sky!: Phaser.GameObjects.Rectangle;
  private backdrop!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.Image;
  private groundFill!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Image;
  private topShade!: Phaser.GameObjects.Image;
  private shadows!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private embers: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private sparkBurst: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private texts!: DamageTextPool;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private readonly lunges = new Map<Side, Phaser.Tweens.Tween>();
  private readonly bannerQueue: { text: string; color: string }[] = [];
  private bannerBusy = false;
  private stageId: StageId = 1;
  private sceneKey = '';
  /** 체력바가 줄어드는 잔상 */
  private readonly hpLag: Record<Side, number> = { slime: 1, monster: 1 };
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly session: GameSession,
    private readonly dpr: number,
  ) {
    super('battle');
  }

  preload(): void {
    this.texRes = textureRes(this.dpr);
    this.monsterMeta = queueCoreTextures(this, this.session.config, this.texRes);
    this.stageId = this.session.view()?.stageId ?? this.session.getProgress().stage.current;
    queueScene(this, this.sceneKeyOf(this.stageId), this.bgRes());
    queueMonsters(this, this.session.config, stageMonsters(this.session.config, this.stageId), this.texRes);
  }

  create(): void {
    this.sky = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0).setDepth(DEPTH.sky);
    this.backdrop = this.add.image(0, 0, KEY.backdrop(this.sceneKeyOf(this.stageId))).setOrigin(0.5, 1).setDepth(DEPTH.backdrop);
    this.ground = this.add.image(0, 0, KEY.ground(this.sceneKeyOf(this.stageId))).setOrigin(0.5, 0).setDepth(DEPTH.ground);
    this.groundFill = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0).setDepth(DEPTH.ground);
    this.shadows = this.add.graphics().setDepth(DEPTH.shadow);
    this.slime = new SlimeView(this);
    this.slime.root.setDepth(DEPTH.slime);
    this.vignette = this.add.image(0, 0, KEY.vignette).setOrigin(0).setDepth(DEPTH.vignette).setAlpha(0.85);
    this.topShade = this.add.image(0, 0, KEY.topShade).setOrigin(0).setDepth(DEPTH.shade);
    this.bars = this.add.graphics().setDepth(DEPTH.bars);
    this.bannerText = this.add.text(0, 0, '', { fontFamily: FONT_FAMILY, stroke: '#1a1026', strokeThickness: 8 }).setOrigin(0.5);
    this.bannerText.setShadow(0, 4, 'rgba(0,0,0,0.5)', 6, true, true);
    this.banner = this.add.container(0, 0, [this.add.image(0, 0, KEY.band).setOrigin(0.5), this.bannerText]).setDepth(DEPTH.banner).setAlpha(0);
    this.texts = new DamageTextPool(this);

    const view = this.session.view();
    if (view) this.stageId = view.stageId;
    this.refreshSlimeLook();
    this.relayout(this.scale.width, this.scale.height);
    this.applyScene(this.sceneKeyOf(this.stageId));
    if (view?.monster) this.showMonster(view.monster.defId, view.monster.seq, false);
    if (view && view.slime.hp <= 0) this.slime.root.setScale(this.slimeScale(), this.slimeScale() * 0.3).setAlpha(0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.unsubscribe = this.session.onEvents((events) => this.onEvents(events));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(time: number, delta: number): void {
    this.session.tick(delta);
    this.drawUnits(time, delta);
  }

  private cleanup(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.slime?.destroy();
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.relayout(size.width, size.height);
  }

  // ── 배치 ────────────────────────────────────────────────

  private relayout(w: number, h: number): void {
    this.layout = computeLayout(w, h, this.dpr);
    const { unit, monsterX } = this.layout;
    this.placeBackground();
    this.createBursts();
    this.vignette.setDisplaySize(w, h);
    this.topShade.setDisplaySize(w, Math.min(h * 0.4, 190 * this.dpr));
    this.bannerText.setFontSize(Math.round(30 * unit));
    this.bannerText.setStroke('#1a1026', Math.round(7 * unit));
    this.banner.setPosition(w / 2, h * 0.36);
    (this.banner.list[0] as Phaser.GameObjects.Image).setDisplaySize(w, 64 * unit);
    if (this.monster) {
      this.monster.setPosition(monsterX, this.monsterY()).setScale(this.monsterScale());
      this.startMonsterIdle();
    }
    this.startIdle();
    this.startAmbient();
    this.syncAllies();
  }

  /** 터지는 입자. 크기 · 속도가 화면 배율을 따르므로 배치가 바뀔 때마다 새로 만든다 */
  private createBursts(): void {
    const u = this.layout.unit;
    this.burst?.destroy();
    this.sparkBurst?.destroy();
    this.burst = this.add
      .particles(0, 0, KEY.dot, {
        emitting: false,
        speed: { min: 70 * u, max: 280 * u },
        lifespan: { min: 380, max: 700 },
        scale: { start: (26 * u) / 64, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH.fx);
    this.sparkBurst = this.add
      .particles(0, 0, KEY.spark, {
        emitting: false,
        speed: { min: 90 * u, max: 260 * u },
        lifespan: { min: 160, max: 320 },
        scale: { start: (30 * u) / 64, end: 0 },
        rotate: { min: 0, max: 90 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH.fx);
  }

  private bgRes(): number {
    const w = this.scale?.width || 720;
    return Math.min(MAX_BG_RES, Math.max(1, Math.ceil((w / 540) * 2) / 2));
  }

  private sceneKeyOf(stageId: StageId): string {
    return findStage(this.session.config, stageId).scene;
  }

  /** 장면 텍스처가 없으면 그 자리에서 굽고, 다 되면 다시 그린다 */
  private applyScene(key: string): void {
    this.sceneKey = key;
    if (!this.textures.exists(KEY.backdrop(key))) {
      queueScene(this, key, this.bgRes());
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.sceneKey === key) this.applyScene(key);
      });
      if (!this.load.isLoading()) this.load.start();
      return;
    }
    this.backdrop.setTexture(KEY.backdrop(key));
    this.ground.setTexture(KEY.ground(key));
    this.placeBackground();
    this.startAmbient();
  }

  private placeBackground(): void {
    if (!this.sceneKey) return;
    const { w, h, groundY } = this.layout;
    const art = sceneInfo(this.sceneKey, this.bgRes());
    const scale = w / this.backdrop.width;
    this.backdrop.setPosition(w / 2, groundY + 2).setScale(scale);
    this.ground.setPosition(w / 2, groundY).setScale(w / this.ground.width);
    const skyBottom = groundY - this.backdrop.displayHeight + 2;
    this.sky.setFillStyle(hex(art.top)).setSize(w, Math.max(1, skyBottom)).setPosition(0, 0);
    const groundEnd = groundY + this.ground.displayHeight - 1;
    this.groundFill.setFillStyle(hex(art.bottom)).setSize(w, Math.max(1, h - groundEnd)).setPosition(0, groundEnd);
    this.cameras.main.setBackgroundColor(art.top);
  }

  /** 장면마다 떠다니는 입자 — 먼지 · 반딧불 · 불티 · 재 */
  private startAmbient(): void {
    this.ambient?.destroy();
    this.ambient = null;
    if (!this.sceneKey) return;
    const { w, groundY, unit } = this.layout;
    const { kind, color, count } = sceneInfo(this.sceneKey, this.bgRes()).ambient;
    const tint = hex(color);
    const px = (design: number) => (design * unit) / 64;
    const common = { tint, maxAliveParticles: count, quantity: 1 };
    const configs: Record<string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
      motes: { ...common, x: { min: 0, max: w }, y: { min: groundY * 0.25, max: groundY }, lifespan: { min: 4000, max: 7000 }, speedX: { min: -10 * unit, max: 10 * unit }, speedY: { min: -18 * unit, max: -4 * unit }, scale: { start: px(9), end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 260, blendMode: Phaser.BlendModes.ADD },
      fireflies: { ...common, x: { min: 0, max: w }, y: { min: groundY * 0.45, max: groundY + 10 * unit }, lifespan: { min: 2600, max: 4200 }, speed: { min: 6 * unit, max: 20 * unit }, scale: { start: px(13), end: px(4) }, alpha: { start: 1, end: 0 }, frequency: 220, blendMode: Phaser.BlendModes.ADD },
      embers: { ...common, x: { min: 0, max: w }, y: { min: groundY - 20 * unit, max: groundY + 40 * unit }, lifespan: { min: 1800, max: 3200 }, speedX: { min: -14 * unit, max: 14 * unit }, speedY: { min: -90 * unit, max: -36 * unit }, scale: { start: px(10), end: 0 }, alpha: { start: 1, end: 0.2 }, frequency: 110, tint: [tint, 0xffd84a, 0xff6a1a], blendMode: Phaser.BlendModes.ADD },
      ash: { ...common, x: { min: -20, max: w + 20 }, y: { min: -10, max: groundY * 0.5 }, lifespan: { min: 6000, max: 9000 }, speedX: { min: -16 * unit, max: -4 * unit }, speedY: { min: 10 * unit, max: 26 * unit }, scale: { start: px(7), end: px(4) }, alpha: { start: 0.75, end: 0 }, frequency: 200 },
    };
    this.ambient = this.add.particles(0, 0, KEY.dot, configs[kind] ?? configs.motes!).setDepth(DEPTH.ambient);
    this.ambient.fastForward(4000);
  }

  private slimeScale(): number {
    return (this.layout.unit * SLIME_SCALE) / this.texRes;
  }

  private monsterScale(): number {
    const def = this.monsterDef;
    const meta = def ? this.monsterMeta.get(def.id) : undefined;
    if (!def || !meta) return this.layout.unit / this.texRes;
    // 큰 보스도 화면 폭의 절반은 넘지 않게
    const want = def.visual.scale * MONSTER_SCALE * this.layout.unit;
    const cap = (this.layout.w * 0.5) / meta.width;
    return Math.min(want, cap) / this.texRes;
  }

  private monsterY(): number {
    const meta = this.monsterDef ? this.monsterMeta.get(this.monsterDef.id) : undefined;
    return this.layout.groundY - (meta?.hover ?? 0) * this.monsterScale() * this.texRes;
  }

  private startIdle(): void {
    const root = this.slime.root;
    this.tweens.killTweensOf(root);
    this.lunges.delete('slime');
    const s = this.slimeScale();
    root.setPosition(this.layout.slimeX, this.layout.groundY).setScale(s);
    this.idleTween = this.tweens.add({ targets: root, scaleX: s * 1.05, scaleY: s * 0.93, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private startMonsterIdle(): void {
    this.monsterIdle?.stop();
    const sprite = this.monster;
    if (!sprite) return;
    const meta = this.monsterDef ? this.monsterMeta.get(this.monsterDef.id) : undefined;
    const s = this.monsterScale();
    sprite.setScale(s);
    this.monsterIdle = meta?.hover
      ? this.tweens.add({ targets: sprite, y: this.monsterY() - 8 * this.layout.unit, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      : this.tweens.add({ targets: sprite, scaleY: s * 1.03, scaleX: s * 0.99, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ── 이벤트 ──────────────────────────────────────────────

  private onEvents(events: readonly SessionEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'battleStarted':
          this.stageId = e.stageId;
          this.removeMonster(false);
          // 첫 몬스터가 나오기(등장 대기) 전에 그 스테이지 몬스터 그림을 굽는다
          if (queueMonsters(this, this.session.config, stageMonsters(this.session.config, e.stageId), this.texRes) && !this.load.isLoading()) this.load.start();
          this.applyScene(this.sceneKeyOf(e.stageId));
          // 서버 저장을 불러오면 형태 · 흡수 색이 통째로 바뀐 채 새 전투가 열린다
          this.refreshSlimeLook();
          this.slime.root.setAlpha(1);
          this.startIdle();
          this.syncAllies();
          this.queueBanner(`스테이지 ${e.stageId} ${e.mode === 'challenge' ? '도전' : '사냥'}`, '#ffffff');
          break;
        case 'monsterSpawned':
          this.showMonster(e.defId, e.seq, true);
          if (e.boss) {
            this.queueBanner(`${findMonster(this.session.config, e.defId).name} 등장!`, '#ff6b6b');
            this.cameras.main.shake(260, 0.006);
          }
          break;
        case 'attack':
          this.lunge(e.by);
          break;
        case 'damage':
          this.onDamage(e);
          break;
        case 'heal': {
          const p = this.textAnchor(e.to);
          this.texts.show(p.x, p.y, `+${e.amount}`, { color: '#7be495', size: this.px(17) });
          if (e.source === 'lifesteal' && e.to === 'slime' && this.formPreset === 'vampire') this.drainParticles();
          break;
        }
        case 'monsterKilled':
          if (this.monster && this.monsterSeq === e.seq) {
            const p = this.textAnchor('monster');
            this.texts.show(p.x, p.y - this.px(6), `+${e.gold} G`, { color: '#ffd84a', size: this.px(21), pop: true });
            this.absorbOrbs(e.family, Math.min(6, 2 + e.absorb));
            this.coins(Math.min(5, 1 + Math.floor(e.gold / 10)));
            this.removeMonster(true);
          }
          this.refreshSlimeLook();
          break;
        case 'levelUp': {
          const p = this.textAnchor('slime');
          this.texts.show(p.x, p.y - this.px(24), `Lv ${e.level}!`, { color: '#7be495', size: this.px(24), pop: true });
          this.ring(this.layout.slimeX, this.layout.groundY - 50 * this.layout.unit, 0x7be495);
          break;
        }
        case 'traitTierUp': {
          const p = this.textAnchor('slime');
          const name = this.session.config.families.find((f) => f.id === e.family)?.name ?? e.family;
          this.texts.show(p.x, p.y - this.px(46), `${name} 특성 ${e.tier}단계`, { color: this.familyColor(e.family), size: this.px(17), pop: true });
          break;
        }
        case 'slimeDied':
          this.idleTween?.stop();
          this.tweens.add({ targets: this.slime.root, scaleY: this.slimeScale() * 0.3, alpha: 0.5, duration: 260, ease: 'Quad.easeIn' });
          this.removeMonster(true);
          break;
        case 'respawned':
          this.slime.root.setAlpha(1);
          this.startIdle();
          break;
        case 'stageCleared':
          this.queueBanner(`스테이지 ${e.stageId} 클리어!`, '#ffd84a');
          this.ring(this.layout.w / 2, this.layout.h * 0.36, 0xffd84a);
          break;
        case 'challengeFailed':
          if (e.reason === 'timeout') this.queueBanner('시간 초과', '#ff6b6b');
          this.queueBanner('도전 실패', '#ff6b6b');
          break;
        case 'heavyWarning':
          if (e.by === 'monster') this.warnHeavy();
          break;
        case 'enraged':
          this.queueBanner('격노!', '#ff6b6b');
          this.cameras.main.shake(200, 0.005);
          break;
        case 'evolved':
          this.playEvolution(e.form);
          break;
        case 'partyChanged':
          this.syncAllies();
          break;
        case 'allyAttack':
          this.allyShot(e.index);
          break;
        case 'gemsGained':
          this.texts.show(this.layout.w / 2, this.layout.h * 0.46, `보석 +${e.amount}`, { color: '#8ff0ff', size: this.px(24), pop: true });
          break;
        case 'rebirth':
          this.playRebirth(e.count, e.essence);
          break;
        case 'burnApplied':
          break;
      }
    }
  }

  private onDamage(e: Extract<BattleEvent, { type: 'damage' }>): void {
    const p = this.textAnchor(e.to);
    let style = { color: '#ffffff', size: this.px(21), pop: false };
    let text = String(e.amount);
    if (e.source === 'burn') style = { color: '#ff9a3c', size: this.px(16), pop: false };
    else if (e.source === 'ally') style = { color: '#8fe9ff', size: this.px(17), pop: false };
    else if (e.heavy) {
      style = { color: '#ff3b3b', size: this.px(32), pop: true };
      text = `${e.amount}!!`;
      this.cameras.main.shake(180, 0.008);
    } else if (e.to === 'slime') style = { color: '#ff7b7b', size: this.px(19), pop: false };
    else if (e.crit) {
      style = { color: '#ffd84a', size: this.px(31), pop: true };
      text = `${e.amount}!`;
      this.cameras.main.shake(90, 0.004);
    } else if (e.reducedBy > 0) style = { color: '#c3cede', size: this.px(19), pop: false };
    this.texts.show(p.x, p.y, text, style);
    this.flash(e.to);
    if (e.source === 'hit') this.hitSpark(e.to, e.crit || !!e.heavy);
    if (e.to === 'slime' && e.source === 'hit' && e.reducedBy > 0 && this.formPreset === 'iron') this.ironSparks();
  }

  // ── 효과 ────────────────────────────────────────────────

  private px(css: number): number {
    return Math.round(css * this.layout.unit);
  }

  private hitSpark(target: Side, big: boolean): void {
    const { unit, groundY, slimeX, monsterX } = this.layout;
    const x = target === 'slime' ? slimeX + 26 * unit : monsterX - 30 * unit;
    const y = groundY - 52 * unit;
    this.sparkBurst?.setParticleTint(target === 'slime' ? 0xffb0b0 : 0xfff3b0);
    this.sparkBurst?.explode(big ? 9 : 5, x, y);
  }

  private ironSparks(): void {
    const { unit, groundY, slimeX } = this.layout;
    this.sparkBurst?.setParticleTint(0xffe08a);
    this.sparkBurst?.explode(6, slimeX + 30 * unit, groundY - 70 * unit);
  }

  /** 처치하면 그 계열 색 구슬이 슬라임에게 빨려 든다 — 「흡수」 */
  private absorbOrbs(family: string, count: number): void {
    const { unit, groundY, slimeX, monsterX } = this.layout;
    const color = hex(this.familyColor(family));
    const fromY = groundY - 50 * unit;
    for (let i = 0; i < count; i++) {
      const orb = this.add.image(monsterX + (Math.random() - 0.5) * 50 * unit, fromY + (Math.random() - 0.5) * 50 * unit, KEY.dot).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale((18 * unit) / 64);
      const midY = fromY - (60 + Math.random() * 60) * unit;
      this.tweens.add({
        targets: orb,
        x: slimeX,
        duration: 520,
        delay: 120 + i * 70,
        ease: 'Sine.easeIn',
      });
      this.tweens.add({
        targets: orb,
        y: { from: orb.y, to: midY },
        duration: 260,
        delay: 120 + i * 70,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: orb,
            y: groundY - 40 * unit,
            scale: (8 * unit) / 64,
            duration: 260,
            ease: 'Sine.easeIn',
            onComplete: () => {
              orb.destroy();
              if (i === count - 1) this.gulp();
            },
          });
        },
      });
    }
    this.burst?.setParticleTint(color);
    this.burst?.explode(14, monsterX, fromY);
  }

  private coins(count: number): void {
    const { unit, groundY, monsterX } = this.layout;
    for (let i = 0; i < count; i++) {
      const coin = this.add.image(monsterX, groundY - 40 * unit, KEY.coin).setDepth(DEPTH.fx).setScale((14 * unit) / 48);
      const dx = (Math.random() - 0.5) * 90 * unit;
      this.tweens.add({ targets: coin, x: monsterX + dx, duration: 520, ease: 'Linear' });
      this.tweens.add({
        targets: coin,
        y: { from: coin.y, to: groundY - (90 + Math.random() * 40) * unit },
        duration: 240,
        ease: 'Quad.easeOut',
        yoyo: true,
        onComplete: () => this.tweens.add({ targets: coin, alpha: 0, y: coin.y - 20 * unit, duration: 300, delay: 120, onComplete: () => coin.destroy() }),
      });
    }
  }

  /** 흡수 마무리 — 슬라임이 꿀꺽 */
  private gulp(): void {
    if (!this.slime.root.alpha) return;
    const s = this.slimeScale();
    this.idleTween?.pause();
    this.tweens.add({
      targets: this.slime.root,
      scaleX: s * 1.14,
      scaleY: s * 0.86,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.idleTween?.resume(),
    });
  }

  private ring(x: number, y: number, color: number): void {
    const ring = this.add.circle(x, y, 26 * this.layout.unit).setStrokeStyle(5 * this.layout.unit, color).setDepth(DEPTH.fx);
    this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** 흡혈 — 몬스터에서 슬라임으로 흐르는 붉은 입자 */
  private drainParticles(): void {
    if (!this.monster) return;
    const { unit, groundY, slimeX, monsterX } = this.layout;
    for (let i = 0; i < 5; i++) {
      const dot = this.add.image(monsterX - 20 * unit, groundY - 50 * unit + (i - 2) * 9 * unit, KEY.dot).setTint(0xff2d5a).setBlendMode(Phaser.BlendModes.ADD).setScale((14 * unit) / 64).setDepth(DEPTH.fx);
      this.tweens.add({ targets: dot, x: slimeX, y: groundY - 40 * unit, alpha: 0.2, duration: 340, delay: i * 40, ease: 'Quad.easeIn', onComplete: () => dot.destroy() });
    }
  }

  /** 강타 예고 — 몬스터 위 느낌표와 붉은 번쩍임 */
  private warnHeavy(): void {
    const sprite = this.monster;
    if (!sprite) return;
    const p = this.textAnchor('monster');
    this.texts.show(p.x, p.y - this.px(18), '강타 준비!', { color: '#ff3b3b', size: this.px(19), pop: true });
    sprite.setTint(0xff6b6b);
    this.tweens.add({ targets: sprite, x: sprite.x + 4 * this.layout.unit, duration: 40, yoyo: true, repeat: 4 });
    this.time.delayedCall(420, () => {
      if (this.monster === sprite) sprite.clearTint();
    });
  }

  /** 진화 연출 — 흰 빛 · 커졌다 돌아오기 · 퍼지는 고리 · 빛 입자 */
  private playEvolution(formId: string): void {
    const form = findForm(this.session.config, formId);
    this.refreshSlimeLook();
    const { unit, groundY, slimeX } = this.layout;
    const s = this.slimeScale();
    const color = hex(form?.visual.tint ?? '#ffffff');
    this.idleTween?.stop();
    this.slime.flash(500);
    this.slime.root.setScale(s * 1.45);
    this.tweens.add({ targets: this.slime.root, scaleX: s, scaleY: s, duration: 720, ease: 'Back.easeOut', onComplete: () => this.startIdle() });
    this.ring(slimeX, groundY - 50 * unit, color);
    this.time.delayedCall(160, () => this.ring(slimeX, groundY - 50 * unit, 0xffffff));
    this.burst?.setParticleTint(color);
    this.burst?.explode(28, slimeX, groundY - 50 * unit);
    this.cameras.main.flash(220, 255, 255, 255);
    this.queueBanner(`${form?.name ?? '진화'}!`, '#ffd84a');
  }

  /** 환생 연출 — 분홍 빛 · 겹 고리 · 빛 입자. 바로 뒤에 1 스테이지 전투가 열린다 */
  private playRebirth(count: number, essence: number): void {
    const { unit, groundY, slimeX, w, h } = this.layout;
    this.cameras.main.flash(500, 255, 214, 236);
    this.ring(slimeX, groundY - 50 * unit, 0xff8fc8);
    this.time.delayedCall(180, () => this.ring(slimeX, groundY - 50 * unit, 0xffffff));
    this.time.delayedCall(360, () => this.ring(w / 2, h * 0.36, 0x5ee4ff));
    this.burst?.setParticleTint(0xff8fc8);
    this.burst?.explode(36, slimeX, groundY - 50 * unit);
    this.queueBanner(`환생 ${count}회째! 정수 +${essence}`, '#ffb3d9');
  }

  private flash(side: Side): void {
    if (side === 'slime') {
      this.slime.flash();
      return;
    }
    const sprite = this.monster;
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (this.monster === sprite) sprite.clearTint();
    });
  }

  /** 진화 전에는 흡수 색으로 물들고, 진화하면 형태 고유 외형으로 바뀐다 */
  private refreshSlimeLook(): void {
    const { config } = this.session;
    const slime = this.session.getProgress().slime;
    const form = slime.form ? findForm(config, slime.form) : undefined;
    this.formPreset = (form?.visual.preset ?? null) as SlimePreset;
    this.slimeColor = form ? hex(form.visual.tint) : slimeTint(slime.absorption, config.families);
    this.slime.setLook(this.formPreset, this.slimeColor);
    this.syncEmbers();
  }

  /** 화염 슬라임 머리 위로 오르는 불티 */
  private syncEmbers(): void {
    if (this.formPreset !== 'flame') {
      this.embers?.destroy();
      this.embers = null;
      return;
    }
    if (this.embers) return;
    const u = this.layout.unit;
    this.embers = this.add
      .particles(0, 0, KEY.dot, {
        follow: this.slime.root,
        followOffset: { x: 0, y: -100 * u * SLIME_SCALE },
        x: { min: -18 * u, max: 18 * u },
        speedY: { min: -70 * u, max: -30 * u },
        speedX: { min: -12 * u, max: 12 * u },
        lifespan: { min: 500, max: 900 },
        scale: { start: (10 * u) / 64, end: 0 },
        tint: [0xffd84a, 0xff7b39],
        frequency: 70,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH.fx);
  }

  private familyColor(family: string): string {
    return this.session.config.families.find((f) => f.id === family)?.color ?? '#ffffff';
  }

  private lunge(side: Side): void {
    const target = side === 'slime' ? this.slime.root : this.monster;
    if (!target) return;
    const baseX = side === 'slime' ? this.layout.slimeX : this.layout.monsterX;
    this.lunges.get(side)?.stop();
    target.x = baseX;
    const dir = side === 'slime' ? 1 : -1;
    this.lunges.set(side, this.tweens.add({ targets: target, x: baseX + dir * 26 * this.layout.unit, duration: 80, yoyo: true, ease: 'Quad.easeOut' }));
  }

  private showMonster(defId: string, seq: number, animate: boolean): void {
    this.removeMonster(false);
    const def = findMonster(this.session.config, defId);
    this.monsterDef = def;
    this.monsterSeq = seq;
    this.hpLag.monster = 1;
    if (!this.textures.exists(KEY.monster(def.id))) {
      // 그림이 아직 없으면 구운 뒤에 보여 준다
      queueMonsters(this, this.session.config, [def.id], this.texRes);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.monsterSeq === seq && !this.monster) this.showMonster(defId, seq, animate);
      });
      if (!this.load.isLoading()) this.load.start();
      return;
    }
    const meta = this.monsterMeta.get(def.id);
    const { monsterX, unit } = this.layout;
    this.monster = this.add
      .image(animate ? monsterX + 60 * unit : monsterX, this.monsterY(), KEY.monster(def.id))
      .setOrigin(0.5, meta ? meta.footY / meta.height : 1)
      .setDepth(DEPTH.monster)
      .setScale(this.monsterScale())
      .setAlpha(animate ? 0 : 1);
    if (animate) this.tweens.add({ targets: this.monster, x: monsterX, alpha: 1, duration: 260, ease: 'Back.easeOut', onComplete: () => this.startMonsterIdle() });
    else this.startMonsterIdle();
  }

  private removeMonster(animate: boolean): void {
    const sprite = this.monster;
    if (!sprite) return;
    this.monster = null;
    this.monsterIdle?.stop();
    this.monsterIdle = null;
    this.lunges.get('monster')?.stop();
    this.lunges.delete('monster');
    this.tweens.killTweensOf(sprite);
    if (!animate) {
      sprite.destroy();
      return;
    }
    sprite.setTintFill(0xffffff);
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      scaleX: sprite.scaleX * 1.25,
      scaleY: sprite.scaleY * 0.2,
      duration: 240,
      ease: 'Quad.easeIn',
      onComplete: () => sprite.destroy(),
    });
  }

  // ── 용병 ────────────────────────────────────────────────

  /** 편성이 바뀌거나 배치가 바뀌면 다시 놓는다 */
  private syncAllies(): void {
    for (const a of this.allies) {
      this.tweens.killTweensOf(a);
      a.destroy();
    }
    const { config } = this.session;
    this.allies = this.session.getProgress().mercenaries.party.flatMap((id, i) => {
      const def = config.mercenaries.find((m) => m.id === id);
      if (!def || !this.textures.exists(KEY.mercenary(id))) return [];
      const { x, y } = this.allyPos(i);
      const img = this.add.image(x, y, KEY.mercenary(id)).setDepth(DEPTH.slime + 1);
      const want = (ALLY_WIDTH[def.look.preset] ?? 60) * this.layout.unit;
      img.setScale(want / img.width);
      this.tweens.add({ targets: img, y: y - 7 * this.layout.unit, duration: 800 + i * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 300 });
      return [img];
    });
  }

  private allyPos(index: number): { x: number; y: number } {
    const { unit, groundY, slimeX } = this.layout;
    const spots = [
      { x: slimeX - 50 * unit, y: groundY - 158 * unit },
      { x: slimeX + 48 * unit, y: groundY - 176 * unit },
    ];
    const spot = spots[index] ?? { x: slimeX, y: groundY - 200 * unit };
    return { x: Math.max(34 * unit, spot.x), y: spot.y };
  }

  /** 지원 공격 — 몬스터 쪽으로 살짝 뛰며 빛 구슬을 쏜다 */
  private allyShot(index: number): void {
    const ally = this.allies[index];
    const target = this.monster;
    if (!ally || !target) return;
    const { unit, monsterX, groundY } = this.layout;
    this.tweens.add({ targets: ally, x: ally.x + 12 * unit, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    const orb = this.add.image(ally.x, ally.y, KEY.dot).setTint(0x8fe9ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale((22 * unit) / 64);
    this.tweens.add({
      targets: orb,
      x: monsterX - 20 * unit,
      y: groundY - 60 * unit,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => {
        orb.destroy();
        this.sparkBurst?.setParticleTint(0x8fe9ff);
        this.sparkBurst?.explode(4, monsterX - 24 * unit, groundY - 60 * unit);
      },
    });
  }

  private textAnchor(side: Side): { x: number; y: number } {
    const { slimeX, monsterX, groundY, unit } = this.layout;
    if (side === 'slime') return { x: slimeX, y: groundY - SLIME_TOP * SLIME_SCALE * unit - 26 * unit };
    const top = this.monster ? this.monster.getTopCenter().y : groundY - 120 * unit;
    return { x: monsterX, y: top - 24 * unit };
  }

  // ── 배너 ────────────────────────────────────────────────

  private queueBanner(text: string, color: string): void {
    this.bannerQueue.push({ text, color });
    if (!this.bannerBusy) this.playNextBanner();
  }

  private playNextBanner(): void {
    const next = this.bannerQueue.shift();
    if (!next) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    this.bannerText.setText(next.text).setColor(next.color);
    this.banner.setAlpha(0).setScale(0.85, 0.6);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' },
        { alpha: 0, duration: 260, delay: BANNER_MS - 460 },
      ],
      onComplete: () => this.playNextBanner(),
    });
  }

  // ── 매 프레임 ───────────────────────────────────────────

  private drawUnits(time: number, delta: number): void {
    const view = this.session.view();
    const { unit, groundY, slimeX, monsterX } = this.layout;
    this.shadows.clear();
    this.bars.clear();
    if (!view) return;

    this.shadows.fillStyle(0x000000, 0.35).fillEllipse(slimeX, groundY + 3 * unit, 104 * unit * SLIME_SCALE, 20 * unit * SLIME_SCALE);
    if (this.monster && this.monsterDef) {
      const meta = this.monsterMeta.get(this.monsterDef.id);
      const width = (meta?.width ?? 140) * this.monsterScale() * this.texRes;
      const hover = meta?.hover ? 0.55 : 1;
      this.shadows.fillStyle(0x000000, 0.35 * hover).fillEllipse(monsterX, groundY + 3 * unit, width * 0.62 * hover, 18 * unit * hover);
    }

    const slimeTop = groundY - SLIME_TOP * SLIME_SCALE * unit;
    this.drawBar('slime', view.slime, slimeX, slimeTop - 12 * unit, 0x5fe08a, delta, time);
    if (view.monster && this.monster) {
      this.drawBar('monster', view.monster, monsterX, this.monster.getTopCenter().y - 12 * unit, 0xff5a5a, delta, time);
    }
  }

  private drawBar(side: Side, u: Readonly<UnitState>, x: number, top: number, color: number, delta: number, time: number): void {
    const s = this.layout.unit;
    const width = 84 * s;
    const height = 10 * s;
    const ratio = Phaser.Math.Clamp(u.hp / u.stats.maxHp, 0, 1);
    // 잔상은 늘 때는 바로, 줄 때는 천천히
    this.hpLag[side] = ratio > this.hpLag[side] ? ratio : Math.max(ratio, this.hpLag[side] - delta * 0.0012);
    const g = this.bars;
    const left = x - width / 2;
    g.fillStyle(0x140d1f, 0.75).fillRoundedRect(left - 2 * s, top - 2 * s, width + 4 * s, height + 4 * s, (height + 4 * s) / 2);
    if (this.hpLag[side] > ratio) g.fillStyle(0xfff1c2, 0.9).fillRoundedRect(left, top, Math.max(height, width * this.hpLag[side]), height, height / 2);
    if (ratio > 0) {
      const w = Math.max(height, width * ratio);
      g.fillStyle(color).fillRoundedRect(left, top, w, height, height / 2);
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(left + 2 * s, top + 1.5 * s, w - 4 * s, height * 0.32, height * 0.16);
    }

    if (u.burn) {
      for (let i = 0; i < u.burn.stacks; i++) {
        const fx = x + (i - (u.burn.stacks - 1) / 2) * 13 * s;
        const flicker = 3 * s * Math.sin(time * 0.02 + i * 1.7);
        const baseY = top - 6 * s;
        g.fillStyle(0xff7b39, 0.95).fillTriangle(fx - 5 * s, baseY, fx + 5 * s, baseY, fx, baseY - 14 * s - flicker);
        g.fillStyle(0xffd84a, 0.95).fillTriangle(fx - 2.5 * s, baseY, fx + 2.5 * s, baseY, fx, baseY - 7 * s - flicker / 2);
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
  const groundY = Math.round(h * 0.75);
  const offset = Math.min(w * 0.24, 190 * unit);
  return { w, h, unit, groundY, slimeX: Math.round(w / 2 - offset), monsterX: Math.round(w / 2 + offset) };
}
