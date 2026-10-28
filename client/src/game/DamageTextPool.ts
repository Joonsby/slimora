import Phaser from 'phaser';

export const FONT_FAMILY = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const POOL_LIMIT = 40;

export interface FloatingTextStyle {
  color: string;
  size: number;
}

/** 피해·회복 숫자. 매번 만들지 않고 돌려 쓴다 */
export class DamageTextPool {
  private readonly pool: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  show(x: number, y: number, text: string, style: FloatingTextStyle): void {
    const t = this.acquire();
    const jitter = (Math.random() - 0.5) * 24;
    t.setText(text)
      .setColor(style.color)
      .setFontSize(style.size)
      .setPosition(x + jitter, y)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: t,
      y: y - 48,
      alpha: 0,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => t.setActive(false).setVisible(false),
    });
  }

  private acquire(): Phaser.GameObjects.Text {
    const idle = this.pool.find((p) => !p.active);
    if (idle) return idle;
    if (this.pool.length >= POOL_LIMIT) {
      const oldest = this.pool.shift()!;
      this.scene.tweens.killTweensOf(oldest);
      this.pool.push(oldest);
      return oldest;
    }
    const created = this.scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(20)
      .setResolution(Math.min(window.devicePixelRatio || 1, 2));
    this.pool.push(created);
    return created;
  }
}
