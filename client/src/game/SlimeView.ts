import Phaser from 'phaser';
import { SLIME_FOOT_Y, SLIME_H, type SlimePreset } from '../art/slime';
import { KEY } from './assets';

const ORIGIN_Y = SLIME_FOOT_Y / SLIME_H;

/** 슬라임 한 마리 — 뒤 장식 · 몸(tint) · 얼굴 · 앞 장식을 한 컨테이너로. 가끔 눈을 깜빡인다 */
export class SlimeView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image;
  private back: Phaser.GameObjects.Image | null = null;
  private front: Phaser.GameObjects.Image | null = null;
  private preset: SlimePreset | undefined = undefined;
  private color = 0xffffff;
  private blinkEvent: Phaser.Time.TimerEvent | null = null;
  private frontTween: Phaser.Tweens.Tween | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.body = scene.add.image(0, 0, KEY.slimeBody).setOrigin(0.5, ORIGIN_Y);
    this.face = scene.add.image(0, 0, KEY.slimeFace(null)).setOrigin(0.5, ORIGIN_Y);
    this.root = scene.add.container(0, 0, [this.body, this.face]);
    this.scheduleBlink();
  }

  setLook(preset: SlimePreset, color: number): void {
    this.color = color;
    this.body.setTint(color);
    if (preset === this.preset) return;
    this.preset = preset;
    this.face.setTexture(KEY.slimeFace(preset));
    this.back?.destroy();
    this.front?.destroy();
    this.frontTween?.stop();
    this.back = this.layer(KEY.slimeBack(preset));
    this.front = this.layer(KEY.slimeFront(preset));
    if (this.back) this.root.addAt(this.back, 0);
    if (this.front) {
      this.root.add(this.front);
      // 불꽃 왕관은 일렁이게
      if (preset === 'flame') this.frontTween = this.scene.tweens.add({ targets: this.front, scaleY: 1.06, scaleX: 0.97, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  /** 맞으면 잠깐 하얗게 */
  flash(ms = 70): void {
    for (const part of this.parts()) part.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => this.restoreTint());
  }

  restoreTint(): void {
    for (const part of this.parts()) part.clearTint();
    this.body.setTint(this.color);
  }

  destroy(): void {
    this.blinkEvent?.remove();
    this.frontTween?.stop();
    this.root.destroy();
  }

  private layer(key: string): Phaser.GameObjects.Image | null {
    return this.scene.textures.exists(key) ? this.scene.add.image(0, 0, key).setOrigin(0.5, ORIGIN_Y) : null;
  }

  private parts(): Phaser.GameObjects.Image[] {
    return [this.back, this.body, this.face, this.front].filter((p): p is Phaser.GameObjects.Image => p !== null);
  }

  private scheduleBlink(): void {
    this.blinkEvent = this.scene.time.delayedCall(2200 + Math.random() * 2600, () => {
      const preset = this.preset ?? null;
      this.face.setTexture(KEY.slimeBlink(preset));
      this.scene.time.delayedCall(130, () => this.face.setTexture(KEY.slimeFace(this.preset ?? null)));
      this.scheduleBlink();
    });
  }
}
