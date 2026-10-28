// 게임 임시 그래픽(client/src/game/textures.ts)과 같은 모양을 큰 벡터로 다시 그린다.
// file:// 에서 열리도록 모듈이 아닌 일반 스크립트로 둔다.
window.Art = (() => {
  let uid = 0;
  const id = (p) => `${p}${++uid}`;
  const place = (x, y, s, ox, oy, body) => `<g transform="translate(${x - ox * s} ${y - oy * s}) scale(${s})">${body}</g>`;

  const helmet = () => {
    const steel = id('steel');
    return `
      <defs><linearGradient id="${steel}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1F4F8"/><stop offset="1" stop-color="#9AA6B6"/></linearGradient></defs>
      <path d="M 196 34 C 190 -6 246 -24 290 -2 C 258 6 240 20 232 46 Z" fill="#E5484D" stroke="#9E2A2E" stroke-width="7" stroke-linejoin="round"/>
      <path d="M 104 112 C 104 18 296 18 296 112 Z" fill="url(#${steel})" stroke="#4F5B6E" stroke-width="9" stroke-linejoin="round"/>
      <path d="M 200 30 L 200 104" stroke="#4F5B6E" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="156" cy="62" rx="24" ry="12" transform="rotate(-24 156 62)" fill="#fff" opacity=".7"/>
      <rect x="92" y="100" width="216" height="30" rx="15" fill="#C3CCD8" stroke="#4F5B6E" stroke-width="9"/>`;
  };

  /** 슬라임. size = 몸통 폭(px), (x, y) = 바닥 중앙 */
  function slime({ x, y, size, top = '#86EECD', bottom = '#2FB98C', line = '#1B7F60', withHelmet = false, shadow = true }) {
    const grad = id('slime');
    const body = `
      <defs><linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
      ${shadow ? '<ellipse cx="200" cy="300" rx="178" ry="20" fill="#000" opacity=".28"/>' : ''}
      <path d="M 30 292 C 8 292 -2 262 14 226 C 40 150 110 62 200 62 C 290 62 360 150 386 226 C 402 262 392 292 370 292 Z" fill="url(#${grad})" stroke="${line}" stroke-width="9" stroke-linejoin="round"/>
      <ellipse cx="104" cy="168" rx="34" ry="17" transform="rotate(-36 104 168)" fill="#fff" opacity=".6"/>
      <circle cx="72" cy="214" r="8" fill="#fff" opacity=".5"/>
      <ellipse cx="152" cy="192" rx="16" ry="22" fill="#1B2A2A"/>
      <ellipse cx="248" cy="192" rx="16" ry="22" fill="#1B2A2A"/>
      <circle cx="158" cy="183" r="6" fill="#fff"/><circle cx="254" cy="183" r="6" fill="#fff"/>
      <ellipse cx="110" cy="232" rx="22" ry="11" fill="#FF6B8E" opacity=".8"/>
      <ellipse cx="290" cy="232" rx="22" ry="11" fill="#FF6B8E" opacity=".8"/>
      <path d="M 184 230 Q 200 246 216 230" fill="none" stroke="#1B2A2A" stroke-width="7" stroke-linecap="round"/>
      ${withHelmet ? helmet() : ''}`;
    return place(x, y, size / 400, 200, 300, body);
  }

  /** 박쥐. size = 날개 폭 */
  function bat({ x, y, size, body = '#A57BE8', wing = '#7D52C9', line = '#3F2475' }) {
    const s = `stroke="${line}" stroke-width="2.4" stroke-linejoin="round"`;
    return place(x, y, size / 120, 60, 70, `
      <polygon points="46,40 4,16 16,62" fill="${wing}" ${s}/><polygon points="46,48 10,54 26,72" fill="${wing}" ${s}/>
      <polygon points="74,40 116,16 104,62" fill="${wing}" ${s}/><polygon points="74,48 110,54 94,72" fill="${wing}" ${s}/>
      <polygon points="44,32 48,10 56,28" fill="${body}" ${s}/><polygon points="64,28 72,10 76,32" fill="${body}" ${s}/>
      <circle cx="60" cy="46" r="22" fill="${body}" ${s}/>
      <circle cx="52" cy="44" r="4.2" fill="#1d1430"/><circle cx="66" cy="44" r="4.2" fill="#1d1430"/>
      <circle cx="53.3" cy="42.6" r="1.4" fill="#fff"/><circle cx="67.3" cy="42.6" r="1.4" fill="#fff"/>
      <polygon points="53,56 57,56 55,63" fill="#fff"/><polygon points="63,56 67,56 65,63" fill="#fff"/>`);
  }

  /** 골렘. size = 몸 폭 */
  function golem({ x, y, size, main = '#C9B896', dark = '#A08B66', light = '#DCCDB0', line = '#5A4A33' }) {
    const s = `stroke="${line}" stroke-width="2.4" stroke-linejoin="round"`;
    return place(x, y, size / 112, 56, 120, `
      <rect x="30" y="96" width="20" height="24" fill="${dark}" ${s}/><rect x="62" y="96" width="20" height="24" fill="${dark}" ${s}/>
      <rect x="2" y="46" width="22" height="50" rx="8" fill="${dark}" ${s}/><rect x="88" y="46" width="22" height="50" rx="8" fill="${dark}" ${s}/>
      <rect x="18" y="40" width="76" height="62" rx="12" fill="${main}" ${s}/>
      <rect x="34" y="8" width="44" height="38" rx="8" fill="${light}" ${s}/>
      <path d="M40 56 L52 70 L46 86 M72 50 L64 66" fill="none" stroke="${line}" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="40" y="22" width="9" height="7" fill="#2a2418"/><rect x="62" y="22" width="9" height="7" fill="#2a2418"/>`);
  }

  /** 화염 드래곤 (왼쪽을 본다). size = 몸 폭 */
  function dragon({ x, y, size, body = '#FF8A4C', wing = '#E0652B', belly = '#FFC690', line = '#7E2E0E' }) {
    const s = `stroke="${line}" stroke-width="2.4" stroke-linejoin="round"`;
    return place(x, y, size / 132, 72, 104, `
      <polygon points="98,70 132,52 106,86" fill="${wing}" ${s}/>
      <polygon points="58,52 86,4 102,50" fill="${wing}" ${s}/>
      <rect x="56" y="84" width="11" height="20" fill="${wing}" ${s}/><rect x="86" y="84" width="11" height="20" fill="${wing}" ${s}/>
      <ellipse cx="76" cy="70" rx="37" ry="23" fill="${body}" ${s}/>
      <ellipse cx="72" cy="80" rx="24" ry="10" fill="${belly}"/>
      <ellipse cx="20" cy="54" rx="14" ry="8" fill="${body}" ${s}/>
      <circle cx="38" cy="46" r="19" fill="${body}" ${s}/>
      <polygon points="40,30 48,12 50,34" fill="#FFE2BE" ${s}/>
      <circle cx="32" cy="42" r="3.6" fill="#2a1408"/><circle cx="33" cy="41" r="1.2" fill="#fff"/>
      <circle cx="12" cy="52" r="1.6" fill="${line}"/>`);
  }

  /** 화상 불꽃. (x, y) = 바닥 */
  function flame(x, y, size) {
    const s = size / 40;
    return place(x, y, s, 20, 60, `
      <path d="M20 60 C 4 60 0 44 8 32 C 12 40 16 40 16 34 C 14 22 20 10 30 0 C 28 14 40 22 38 40 C 36 54 30 60 20 60 Z" fill="#FF7B39"/>
      <path d="M20 60 C 12 60 10 50 14 44 C 16 48 20 48 20 44 C 20 38 24 34 28 30 C 28 40 32 44 30 52 C 29 57 25 60 20 60 Z" fill="#FFD84A"/>`);
  }

  function hpBar(cx, y, width, ratio, color) {
    const h = Math.max(10, width * 0.09);
    return `<rect x="${cx - width / 2 - 4}" y="${y - 4}" width="${width + 8}" height="${h + 8}" rx="${(h + 8) / 2}" fill="#000" opacity=".55"/>
      <rect x="${cx - width / 2}" y="${y}" width="${width * ratio}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
  }

  function damage(x, y, text, size, color) {
    return `<text x="${x}" y="${y}" font-family="Jua, 'Malgun Gothic', sans-serif" font-size="${size}" text-anchor="middle"
      fill="${color}" stroke="#141022" stroke-width="${size * 0.14}" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
  }

  /** 폰트가 늦게 오면 캡처 전에 기다린다. 글자가 없는 그림은 usesFont = false */
  function ready(usesFont = true) {
    document.fonts.ready.then(() => {
      document.body.dataset.ready = !usesFont ? 'no-text' : document.fonts.check('48px Jua') ? 'font' : 'fallback';
    });
  }

  return { slime, bat, golem, dragon, flame, hpBar, damage, ready };
})();
