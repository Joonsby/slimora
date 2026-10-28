import Phaser from 'phaser';
import { findMonster, findStage } from '../core/lookup';
import type { BattleEvent, Side, UnitState } from '../core/model/battle';
import type { StageId } from '../core/model/ids';
import type { GameSession, SessionEvent } from '../session/GameSession';
import { DamageTextPool, FONT_FAMILY } from './DamageTextPool';
import { slimeTint } from './slimeColor';
import { createPlaceholderTextures, presetTexture, TEX } from './textures';

interface Layout {
  w: number;
  h: number;
  unit: number;
  groundY: number;
  slimeX: number;
  monsterX: number;
}

const STAGE_COLORS: Record<string, { sky: number; ground: number }> = {
  bat: { sky: 0x1e1b30, ground: 0x2d2947 },
  golem: { sky: 0x25221c, ground: 0x3b3529 },
  fire: { sky: 0x2b1814, ground: 0x47241b },
};
const DEFAULT_COLORS = { sky: 0x1d2436, ground: 0x2a3350 };

const BANNER_MS = 1100;

/** 전투 장면. 계산은 하지 않고 세션 이벤트와 읽기 전용 뷰를 그린다 */
export class BattleScene extends Phaser.Scene {
  private layout: Layout = computeLayout(360, 320);
  private slime!: Phaser.GameObjects.Image;
  private monster: Phaser.GameObjects.Image | null = null;
  private monsterSeq = 0;
  private monsterTint = 0xffffff;
  private slimeColor = 0xffffff;
  private ground!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Text;
  private texts!: DamageTextPool;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private readonly lunges = new Map<Side, Phaser.Tweens.Tween>();
  private readonly bannerQueue: { text: string; color: string }[] = [];
  private bannerBusy = false;
  private stageId: StageId = 1;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly session: GameSession) {
    super('battle');
  }

  create(): void {
    createPlaceholderTextures(this);
    this.ground = this.add.graphics().setDepth(0);
    this.slime = this.add.image(0, 0, TEX.slime).setOrigin(0.5, 1).setDepth(5);
    this.overlay = this.add.graphics().setDepth(10);
    this.banner = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontStyle: 'bold', stroke: '#000000', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0)
      .setResolution(Math.min(window.devicePixelRatio || 1, 2));
    this.texts = new DamageTextPool(this);

    const view = this.session.view();
    if (view) this.stageId = view.stageId;
    this.refreshSlimeColor();
    this.relayout(this.scale.width, this.scale.height);
    if (view?.monster) this.showMonster(view.monster.defId, view.monster.seq, false);
    if (view && view.slime.hp <= 0) this.slime.setScale(this.layout.unit, this.layout.unit * 0.3).setAlpha(0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.unsubscribe = this.session.onEvents((events) => this.onEvents(events));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(time: number, delta: number): void {
    this.session.tick(delta);
    this.drawOverlay(time);
  }

  private cleanup(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.relayout(size.width, size.height);
  }

  private relayout(w: number, h: number): void {
    this.layout = computeLayout(w, h);
    const { unit, groundY, slimeX, monsterX } = this.layout;
    this.drawGround();
    this.slime.setPosition(slimeX, groundY).setScale(unit);
    if (this.monster) this.monster.setPosition(monsterX, groundY).setScale(this.monsterScale());
    this.banner.setPosition(w / 2, h * 0.3).setFontSize(Math.round(26 * unit));
    this.startIdle();
  }

  private drawGround(): void {
    const { w, h, groundY } = this.layout;
    const colors = this.stageColors();
    this.cameras.main.setBackgroundColor(colors.sky);
    this.ground.clear();
    this.ground.fillStyle(colors.ground).fillRect(0, groundY, w, h - groundY);
    this.ground.fillStyle(0xffffff, 0.06).fillRect(0, groundY, w, 3);
  }

  private stageColors() {
    const stage = findStage(this.session.config, this.stageId);
    const first = stage.spawns[0];
    const family = first ? findMonster(this.session.config, first.monster).family : '';
    return STAGE_COLORS[family] ?? DEFAULT_COLORS;
  }

  private startIdle(): void {
    this.tweens.killTweensOf(this.slime);
    this.lunges.delete('slime');
    const u = this.layout.unit;
    this.slime.setPosition(this.layout.slimeX, this.layout.groundY).setScale(u);
    this.idleTween = this.tweens.add({
      targets: this.slime,
      scaleX: u * 1.05,
      scaleY: u * 0.93,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private monsterScale(): number {
    const view = this.session.view();
    const defId = view?.monster?.defId;
    const scale = defId ? findMonster(this.session.config, defId).visual.scale : 1;
    return scale * this.layout.unit;
  }

  private onEvents(events: readonly SessionEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'battleStarted':
          this.stageId = e.stageId;
          this.removeMonster(false);
          this.drawGround();
          this.slime.setAlpha(1);
          this.startIdle();
          this.queueBanner(`스테이지 ${e.stageId} ${e.mode === 'challenge' ? '도전' : '사냥'}`, '#ffffff');
          break;
        case 'monsterSpawned':
          this.showMonster(e.defId, e.seq, true);
          break;
        case 'attack':
          this.lunge(e.by);
          break;
        case 'damage':
          this.onDamage(e);
          break;
        case 'heal': {
          const p = this.textAnchor(e.to);
          this.texts.show(p.x, p.y, `+${e.amount}`, { color: '#7be495', size: Math.round(17 * this.layout.unit) });
          break;
        }
        case 'monsterKilled':
          if (this.monster && this.monsterSeq === e.seq) {
            const p = this.textAnchor('monster');
            this.texts.show(p.x, p.y - 10, `+${e.gold} G`, { color: '#ffd84a', size: Math.round(20 * this.layout.unit) });
            this.texts.show(p.x, p.y + 16 * this.layout.unit, `흡수 +${e.absorb}`, { color: this.familyColor(e.family), size: Math.round(14 * this.layout.unit) });
            this.removeMonster(true);
          }
          this.refreshSlimeColor();
          break;
        case 'levelUp': {
          const p = this.textAnchor('slime');
          this.texts.show(p.x, p.y - 20 * this.layout.unit, `Lv ${e.level}!`, { color: '#7be495', size: Math.round(22 * this.layout.unit) });
          break;
        }
        case 'traitTierUp': {
          const p = this.textAnchor('slime');
          const name = this.session.config.families.find((f) => f.id === e.family)?.name ?? e.family;
          this.texts.show(p.x, p.y - 40 * this.layout.unit, `${name} 특성 ${e.tier}단계`, { color: this.familyColor(e.family), size: Math.round(16 * this.layout.unit) });
          break;
        }
        case 'slimeDied':
          this.idleTween?.stop();
          this.tweens.add({ targets: this.slime, scaleY: this.layout.unit * 0.3, alpha: 0.5, duration: 260, ease: 'Quad.easeIn' });
          this.removeMonster(true);
          break;
        case 'respawned':
          this.slime.setAlpha(1);
          this.startIdle();
          break;
        case 'stageCleared':
          this.queueBanner(`스테이지 ${e.stageId} 클리어!`, '#ffd84a');
          break;
        case 'challengeFailed':
          this.queueBanner('도전 실패', '#ff6b6b');
          break;
        case 'burnApplied':
          break;
      }
    }
  }

  private onDamage(e: Extract<BattleEvent, { type: 'damage' }>): void {
    const u = this.layout.unit;
    const p = this.textAnchor(e.to);
    let style = { color: '#ffffff', size: Math.round(20 * u) };
    let text = String(e.amount);
    if (e.source === 'burn') style = { color: '#ff9a3c', size: Math.round(16 * u) };
    else if (e.to === 'slime') style = { color: '#ff6b6b', size: Math.round(18 * u) };
    else if (e.crit) {
      style = { color: '#ffd84a', size: Math.round(28 * u) };
      text = `${e.amount}!`;
    } else if (e.reducedBy > 0) style = { color: '#c3cede', size: Math.round(19 * u) };
    this.texts.show(p.x, p.y, text, style);
    this.flash(e.to);
  }

  private flash(side: Side): void {
    const sprite = side === 'slime' ? this.slime : this.monster;
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      sprite.setTint(side === 'slime' ? this.slimeColor : this.monsterTint);
    });
  }

  private refreshSlimeColor(): void {
    const { config } = this.session;
    this.slimeColor = slimeTint(this.session.getProgress().slime.absorption, config.families);
    this.slime.setTint(this.slimeColor);
  }

  private familyColor(family: string): string {
    return this.session.config.families.find((f) => f.id === family)?.color ?? '#ffffff';
  }

  private lunge(side: Side): void {
    const sprite = side === 'slime' ? this.slime : this.monster;
    if (!sprite) return;
    const baseX = side === 'slime' ? this.layout.slimeX : this.layout.monsterX;
    this.lunges.get(side)?.stop();
    sprite.x = baseX;
    const dir = side === 'slime' ? 1 : -1;
    this.lunges.set(
      side,
      this.tweens.add({ targets: sprite, x: baseX + dir * 20 * this.layout.unit, duration: 70, yoyo: true, ease: 'Quad.easeOut' }),
    );
  }

  private showMonster(defId: string, seq: number, animate: boolean): void {
    this.removeMonster(false);
    const def = findMonster(this.session.config, defId);
    const { monsterX, groundY, unit } = this.layout;
    this.monsterTint = Phaser.Display.Color.HexStringToColor(def.visual.tint).color;
    this.monsterSeq = seq;
    this.monster = this.add
      .image(animate ? monsterX + 48 * unit : monsterX, groundY, presetTexture(def.visual.preset))
      .setOrigin(0.5, 1)
      .setDepth(4)
      .setScale(def.visual.scale * unit)
      .setTint(this.monsterTint)
      .setAlpha(animate ? 0 : 1);
    if (animate) this.tweens.add({ targets: this.monster, x: monsterX, alpha: 1, duration: 220, ease: 'Quad.easeOut' });
  }

  private removeMonster(animate: boolean): void {
    const sprite = this.monster;
    if (!sprite) return;
    this.monster = null;
    this.lunges.get('monster')?.stop();
    this.lunges.delete('monster');
    if (!animate) {
      sprite.destroy();
      return;
    }
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      scaleX: sprite.scaleX * 0.4,
      scaleY: sprite.scaleY * 0.4,
      angle: 25,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => sprite.destroy(),
    });
  }

  private textAnchor(side: Side): { x: number; y: number } {
    const { slimeX, monsterX, groundY, unit } = this.layout;
    const sprite = side === 'slime' ? this.slime : this.monster;
    const height = sprite ? sprite.displayHeight : 90 * unit;
    return { x: side === 'slime' ? slimeX : monsterX, y: groundY - height - 18 * unit };
  }

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
    this.banner.setText(next.text).setColor(next.color).setAlpha(0).setScale(0.8);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' },
        { alpha: 0, duration: 260, delay: BANNER_MS - 440 },
      ],
      onComplete: () => this.playNextBanner(),
    });
  }

  private drawOverlay(time: number): void {
    const view = this.session.view();
    const g = this.overlay;
    g.clear();
    if (!view) return;
    const { unit, groundY, slimeX, monsterX } = this.layout;

    g.fillStyle(0x000000, 0.25).fillEllipse(slimeX, groundY + 2, 84 * unit, 14 * unit);
    if (this.monster) g.fillEllipse(monsterX, groundY + 2, 90 * unit, 16 * unit);

    this.drawUnitStatus(g, view.slime, slimeX, this.slime.displayHeight, 0x5fe08a, time);
    if (view.monster && this.monster) this.drawUnitStatus(g, view.monster, monsterX, this.monster.displayHeight, 0xff5a5a, time);
  }

  private drawUnitStatus(g: Phaser.GameObjects.Graphics, unit: Readonly<UnitState>, x: number, spriteHeight: number, color: number, time: number): void {
    const u = this.layout.unit;
    const width = 78 * u;
    const height = 8 * u;
    const top = this.layout.groundY - spriteHeight - 12 * u;
    const ratio = Phaser.Math.Clamp(unit.hp / unit.stats.maxHp, 0, 1);
    g.fillStyle(0x000000, 0.55).fillRoundedRect(x - width / 2 - 2, top - 2, width + 4, height + 4, 4);
    if (ratio > 0) g.fillStyle(color).fillRoundedRect(x - width / 2, top, width * ratio, height, 3);

    if (unit.burn) {
      for (let i = 0; i < unit.burn.stacks; i++) {
        const fx = x + (i - (unit.burn.stacks - 1) / 2) * 14 * u;
        const flicker = 4 * u * Math.sin(time * 0.02 + i * 1.7);
        const baseY = this.layout.groundY - spriteHeight * 0.45;
        g.fillStyle(0xff7b39, 0.9).fillTriangle(fx - 6 * u, baseY, fx + 6 * u, baseY, fx, baseY - 18 * u - flicker);
        g.fillStyle(0xffd84a, 0.9).fillTriangle(fx - 3 * u, baseY, fx + 3 * u, baseY, fx, baseY - 9 * u - flicker / 2);
      }
    }
  }
}

function computeLayout(w: number, h: number): Layout {
  const unit = Phaser.Math.Clamp(Math.min(w / 360, h / 300), 0.6, 1.6);
  return { w, h, unit, groundY: Math.round(h * 0.8), slimeX: Math.round(w * 0.28), monsterX: Math.round(w * 0.72) };
}
