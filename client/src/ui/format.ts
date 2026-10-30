const UNITS = ['', 'K', 'M', 'B', 'T'];

/** T 다음은 aa · ab … az · ba … (방치형 게임 표기) */
function unitName(i: number): string {
  if (i < UNITS.length) return UNITS[i]!;
  const n = i - UNITS.length;
  return String.fromCharCode(97 + Math.floor(n / 26), 97 + (n % 26));
}

/** 2시간 13분 · 5분 */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 1,234 · 12.3K · 4.5M · 7.8aa */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const v = Math.floor(n);
  if (Math.abs(v) < 10_000) return v.toLocaleString('ko-KR');
  let scaled = v;
  let i = 0;
  while (Math.abs(scaled) >= 1000) {
    scaled /= 1000;
    i++;
  }
  return `${scaled >= 100 ? Math.floor(scaled) : Math.floor(scaled * 10) / 10}${unitName(i)}`;
}

/** 배율 — ×1.21 · ×12.5 · ×3.4K */
export function formatMultiplier(m: number): string {
  if (m >= 100) return `×${formatNumber(m)}`;
  return `×${m >= 10 ? Math.floor(m * 10) / 10 : Math.floor(m * 100) / 100}`;
}
