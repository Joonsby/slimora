import { lighten, ramp, shade } from './color';
import { gid, linear, radial, svgDoc, type Sprite } from './svg';

/**
 * 몬스터는 데이터의 기본색(visual.tint) 하나로 명암을 만들어 제 색으로 그린다. 모두 왼쪽(슬라임 쪽)을 본다.
 * footY = 발이 닿는 높이(디자인 단위). 박쥐는 떠 있으므로 그림 아래 끝
 */
export interface MonsterSprite extends Sprite {
  footY: number;
  /** 땅에서 띄울 높이(디자인 단위) */
  hover: number;
}

/** 눈. 흰자 + 왼쪽을 보는 눈동자 + 반짝임. angry 면 눈썹 */
function eye(x: number, y: number, r: number, pupil: string, brow: string | null): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.15}" fill="#fff" stroke="${brow ?? '#222'}" stroke-width="1.6"/>
    <ellipse cx="${x - r * 0.28}" cy="${y + r * 0.1}" rx="${r * 0.58}" ry="${r * 0.72}" fill="${pupil}"/>
    <circle cx="${x - r * 0.05}" cy="${y - r * 0.3}" r="${r * 0.26}" fill="#fff"/>
    ${brow ? `<path d="M ${x - r * 1.1} ${y - r * 1.5} L ${x + r * 0.9} ${y - r * 1.05}" stroke="${brow}" stroke-width="${r * 0.42}" stroke-linecap="round"/>` : ''}`;
}

function bat(color: string): string {
  const c = ramp(color);
  const wing = ramp(shade(color, 0.22));
  const bodyG = gid('bb');
  const wingG = gid('bw');
  const w = 'M 72 62 C 54 34 22 24 3 36 C 13 42 15 52 9 60 C 21 58 28 66 24 76 C 36 70 46 76 46 86 C 55 76 64 72 74 74 Z';
  return `<defs>${radial(bodyG, [[0, c.light], [0.7, c.base], [1, c.dark]], 0.4, 0.35, 0.7)}${linear(wingG, [[0, wing.light], [1, wing.dark]])}</defs>
    <g stroke="${c.line}" stroke-width="3" stroke-linejoin="round">
      <path d="${w}" fill="url(#${wingG})"/>
      <path d="${w}" fill="url(#${wingG})" transform="translate(170 0) scale(-1 1)"/>
      <path d="M 68 48 L 60 16 L 82 40 Z M 102 48 L 110 16 L 88 40 Z" fill="${c.base}"/>
      <ellipse cx="85" cy="64" rx="27" ry="25" fill="url(#${bodyG})"/>
    </g>
    <path d="M 70 60 L 18 40 M 70 66 L 22 64 M 70 70 L 40 82 M 100 60 L 152 40 M 100 66 L 148 64 M 100 70 L 130 82" stroke="${wing.line}" stroke-width="1.6" opacity=".55"/>
    <path d="M 68 44 L 64 26 L 76 40 Z M 102 44 L 106 26 L 94 40 Z" fill="${lighten(color, 0.45)}" opacity=".7"/>
    <ellipse cx="85" cy="76" rx="15" ry="10" fill="${c.light}" opacity=".6"/>
    ${eye(75, 60, 6.5, '#2a0f3a', c.line)}${eye(95, 60, 6.5, '#2a0f3a', null)}
    <path d="M 95 50 L 102 53" stroke="${c.line}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M 78 74 Q 85 80 92 74" fill="#3a0d1c" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M 79 74.5 L 81 80 L 83 75 Z M 87 75 L 89 80 L 91 74.5 Z" fill="#fff"/>
    <path d="M 78 88 L 76 94 M 82 89 L 82 95 M 88 89 L 88 95 M 92 88 L 94 94" stroke="${c.line}" stroke-width="2.4" stroke-linecap="round"/>`;
}

function golem(color: string): string {
  const c = ramp(color);
  const stone = gid('gs');
  const glow = gid('gg');
  const moss = '#6f9a3b';
  return `<defs>${linear(stone, [[0, c.light], [0.6, c.base], [1, c.dark]])}${radial(glow, [[0, '#d6fbff'], [0.35, '#5fe6ff'], [1, '#5fe6ff', 0]])}</defs>
    <g stroke="${c.line}" stroke-width="3.2" stroke-linejoin="round">
      <rect x="112" y="72" width="28" height="54" rx="12" fill="${c.dark}"/>
      <rect x="44" y="118" width="26" height="38" rx="8" fill="${c.dark}"/>
      <rect x="80" y="118" width="26" height="38" rx="8" fill="${c.dark}"/>
      <rect x="22" y="56" width="106" height="72" rx="24" fill="url(#${stone})"/>
      <rect x="48" y="22" width="56" height="42" rx="14" fill="url(#${stone})"/>
      <rect x="4" y="70" width="32" height="56" rx="13" fill="url(#${stone})"/>
      <circle cx="20" cy="132" r="17" fill="${c.base}"/>
    </g>
    <path d="M 56 84 L 66 96 L 60 110 M 96 76 L 88 90 L 98 100 M 64 34 L 70 42" fill="none" stroke="${c.line}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
    <path d="M 30 64 C 40 52 64 52 74 58 C 66 64 50 62 42 70 C 38 66 34 66 30 64 Z M 50 26 C 58 18 80 18 90 24 C 80 28 66 26 60 32 Z" fill="${moss}" opacity=".85"/>
    <circle cx="76" cy="94" r="15" fill="url(#${glow})" opacity=".55"/>
    <path d="M 70 90 L 76 84 L 82 90 L 76 100 Z" fill="none" stroke="#bff6ff" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="64" cy="42" r="11" fill="url(#${glow})"/><circle cx="88" cy="42" r="11" fill="url(#${glow})"/>
    <rect x="58" y="39" width="12" height="6" rx="3" fill="#effdff"/><rect x="82" y="39" width="12" height="6" rx="3" fill="#effdff"/>
    <path d="M 56 33 L 72 38 M 96 33 L 80 38" stroke="${c.line}" stroke-width="3.4" stroke-linecap="round"/>
    <ellipse cx="44" cy="70" rx="12" ry="5" fill="#fff" opacity=".22"/>`;
}

function dragon(color: string): string {
  const c = ramp(color);
  const belly = lighten(color, 0.55);
  const wing = ramp(shade(color, 0.12));
  const bodyG = gid('db');
  const wingG = gid('dw');
  return `<defs>${linear(bodyG, [[0, c.light], [0.55, c.base], [1, c.dark]])}${linear(wingG, [[0, wing.light], [1, wing.dark]])}</defs>
    <g stroke="${c.line}" stroke-width="3" stroke-linejoin="round">
      <path d="M 120 82 L 142 14 L 186 30 C 176 38 178 48 170 54 C 164 58 160 66 154 70 Z" fill="url(#${wingG})"/>
      <path d="M 138 112 C 160 112 174 104 182 88 C 186 80 184 74 178 72 L 188 62 L 172 66 L 176 76 C 170 92 156 100 136 98 Z" fill="${c.base}"/>
      <path d="M 96 124 L 92 146 L 108 146 L 110 124 Z M 128 124 L 126 146 L 142 146 L 142 124 Z" fill="${c.dark}"/>
      <ellipse cx="118" cy="106" rx="42" ry="28" fill="url(#${bodyG})"/>
      <path d="M 92 96 C 80 88 72 76 64 68 L 84 58 C 90 70 98 80 108 86 Z" fill="${c.base}"/>
      <path d="M 52 40 C 58 26 72 20 86 22 C 78 28 74 34 72 42 Z M 62 42 C 70 32 82 30 94 34 C 86 38 82 44 80 50 Z" fill="#fff1d6"/>
      <ellipse cx="54" cy="60" rx="31" ry="24" fill="url(#${bodyG})"/>
      <ellipse cx="29" cy="72" rx="20" ry="14" fill="${c.base}"/>
      <path d="M 112 88 L 128 28 C 140 30 156 38 162 50 C 152 52 148 60 140 62 C 136 68 128 70 122 74 C 118 82 116 86 112 88 Z" fill="url(#${wingG})"/>
    </g>
    <path d="M 128 30 L 122 80 M 128 30 L 140 62 M 128 30 L 160 50" stroke="${wing.line}" stroke-width="1.8" opacity=".6"/>
    <ellipse cx="114" cy="116" rx="28" ry="12" fill="${belly}" opacity=".85"/>
    <path d="M 96 112 L 98 124 M 106 112 L 106 126 M 116 112 L 115 127 M 126 112 L 124 125" stroke="${shade(belly, 0.25)}" stroke-width="1.8"/>
    <path d="M 100 80 L 104 70 L 110 80 M 114 78 L 120 68 L 124 80 M 128 80 L 136 72 L 138 84" fill="${c.dark}" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M 92 146 L 89 150 M 98 146 L 97 150 M 126 146 L 123 150 M 132 146 L 131 150" stroke="${c.line}" stroke-width="2.4" stroke-linecap="round"/>
    ${eye(50, 54, 8.5, '#3a1200', c.line)}
    <circle cx="17" cy="67" r="2.2" fill="${c.line}"/>
    <path d="M 12 80 Q 28 86 46 78" fill="none" stroke="${c.line}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M 20 81.5 L 22.5 87 L 25.5 82.5 Z M 30 82.5 L 32 87.5 L 35 82 Z" fill="#fff"/>
    <ellipse cx="44" cy="50" rx="10" ry="4.5" transform="rotate(-20 44 50)" fill="#fff" opacity=".3"/>`;
}

const PRESETS: Record<string, { draw: (color: string) => string; w: number; h: number; footY: number; hover: number }> = {
  bat: { draw: bat, w: 170, h: 100, footY: 96, hover: 34 },
  golem: { draw: golem, w: 150, h: 160, footY: 156, hover: 0 },
  dragon: { draw: dragon, w: 190, h: 152, footY: 148, hover: 0 },
};

export function monsterSprite(preset: string, color: string, res: number): MonsterSprite {
  const p = PRESETS[preset] ?? PRESETS.golem!;
  return { svg: svgDoc(p.w, p.h, p.draw(color), res), width: p.w, height: p.h, footY: p.footY, hover: p.hover };
}
