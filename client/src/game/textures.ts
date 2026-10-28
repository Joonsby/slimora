import Phaser from 'phaser';

export const TEX = {
  slime: 'tex-slime',
  bat: 'tex-bat',
  golem: 'tex-golem',
  dragon: 'tex-dragon',
  blob: 'tex-blob',
} as const;

const PRESET_TEXTURE: Record<string, string> = { bat: TEX.bat, golem: TEX.golem, dragon: TEX.dragon };

/** 몬스터 데이터의 visual.preset → 텍스처 키. 모르는 프리셋은 기본 덩어리 */
export function presetTexture(preset: string): string {
  return PRESET_TEXTURE[preset] ?? TEX.blob;
}

/**
 * 임시 그래픽. 몬스터는 회색조로 그려 데이터의 tint 로 색을 입힌다.
 * 몬스터는 왼쪽(슬라임 쪽)을 바라본다.
 */
export function createPlaceholderTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.slime)) return;
  const g = scene.make.graphics({}, false);

  // 슬라임 120×100 — 회색조로 그리고 흡수 색(slimeColor)을 tint 로 입힌다
  g.fillStyle(0xf0f0f0).fillEllipse(60, 66, 108, 66).fillEllipse(60, 48, 72, 52);
  g.fillStyle(0xc2c2c2).fillEllipse(60, 88, 94, 18);
  g.fillStyle(0xffffff, 0.7).fillEllipse(40, 40, 22, 12);
  g.fillStyle(0x1a1a1a).fillCircle(50, 62, 6).fillCircle(76, 62, 6);
  g.fillStyle(0xffffff).fillCircle(52, 60, 2).fillCircle(78, 60, 2);
  g.generateTexture(TEX.slime, 120, 100);

  // 박쥐 120×84
  g.clear();
  g.fillStyle(0xb8b8b8)
    .fillTriangle(46, 40, 4, 16, 16, 62)
    .fillTriangle(46, 48, 10, 54, 26, 72)
    .fillTriangle(74, 40, 116, 16, 104, 62)
    .fillTriangle(74, 48, 110, 54, 94, 72);
  g.fillStyle(0xe8e8e8).fillCircle(60, 46, 22).fillTriangle(44, 32, 48, 10, 56, 28).fillTriangle(64, 28, 72, 10, 76, 32);
  g.fillStyle(0x222222).fillCircle(52, 44, 4).fillCircle(66, 44, 4);
  g.fillStyle(0xffffff).fillTriangle(53, 56, 57, 56, 55, 63).fillTriangle(63, 56, 67, 56, 65, 63);
  g.generateTexture(TEX.bat, 120, 84);

  // 골렘 112×120
  g.clear();
  g.fillStyle(0xa6a6a6).fillRect(30, 96, 20, 24).fillRect(62, 96, 20, 24);
  g.fillStyle(0xbdbdbd).fillRoundedRect(2, 46, 22, 50, 8).fillRoundedRect(88, 46, 22, 50, 8);
  g.fillStyle(0xd6d6d6).fillRoundedRect(18, 40, 76, 62, 12);
  g.fillStyle(0xe4e4e4).fillRoundedRect(34, 8, 44, 38, 8);
  g.lineStyle(3, 0x8a8a8a).lineBetween(40, 56, 52, 70).lineBetween(52, 70, 46, 86).lineBetween(72, 50, 64, 66);
  g.fillStyle(0x333333).fillRect(40, 22, 9, 7).fillRect(62, 22, 9, 7);
  g.generateTexture(TEX.golem, 112, 120);

  // 화염 드래곤 132×104
  g.clear();
  g.fillStyle(0xbdbdbd).fillTriangle(98, 70, 132, 52, 106, 86);
  g.fillStyle(0xa4a4a4).fillTriangle(58, 52, 86, 4, 102, 50);
  g.fillStyle(0xc4c4c4).fillRect(56, 84, 11, 20).fillRect(86, 84, 11, 20);
  g.fillStyle(0xdedede).fillEllipse(76, 70, 74, 46);
  g.fillStyle(0xf4f4f4).fillEllipse(72, 80, 48, 20);
  g.fillStyle(0xe6e6e6).fillCircle(38, 46, 19).fillEllipse(20, 54, 28, 16);
  g.fillStyle(0xb8b8b8).fillTriangle(40, 30, 48, 12, 50, 34);
  g.fillStyle(0x222222).fillCircle(32, 42, 3.5);
  g.generateTexture(TEX.dragon, 132, 104);

  // 기본 덩어리 100×90
  g.clear();
  g.fillStyle(0xdddddd).fillEllipse(50, 54, 90, 66);
  g.fillStyle(0x222222).fillCircle(38, 50, 5).fillCircle(60, 50, 5);
  g.generateTexture(TEX.blob, 100, 90);

  g.destroy();
}
