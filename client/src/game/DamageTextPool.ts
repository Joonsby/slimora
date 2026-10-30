import Phaser from 'phaser';

export const FONT_FAMILY = '"Jua", system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const POOL_LIMIT = 40;

export interface FloatingTextStyle {
  color: string;
  /** 픽셀 */
  size: number;
  /** 치명타 · 강타처럼 크게 튀어나오게 */
  pop?: boolean;
}

/** 피해 · 회복 숫자. 매번 만들지 않고 돌려 쓴다. 거리는 글자 크기에 비례 */
export class DamageTextPool {
  private readonly pool: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  show(x: number, y: number, text: string, style: FloatingTextStyle): void {
    const t = this.acquire();
    const jitter = (Math.random() - 0.5) * style.size * 1.2;
    t.setText(text)
      .setColor(style.color)
      .setFontSize(style.size)
      .setStroke('#1a1026', Math.max(3, style.size * 0.2))
      .setPosition(x + jitter, y)
      .setAlpha(1)
      .setScale(style.pop ? 1.6 : 1.2)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({ targets: t, scale: 1, duration: style.pop ? 220 : 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - style.size * 2.4,
      alpha: 0,
      delay: style.pop ? 320 : 180,
      duration: 620,
      ease: 'Cubic.easeIn',
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
    const created = this.scene.add.text(0, 0, '', { fontFamily: FONT_FAMILY, stroke: '#1a1026', strokeThickness: 4 }).setOrigin(0.5).setDepth(40);
    created.setShadow(0, 2, 'rgba(0,0,0,0.45)', 2, true, true);
    this.pool.push(created);
    return created;
  }
}
