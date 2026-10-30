const UNITS = ['', 'K', 'M', 'B', 'T'];

/** 2시간 13분 · 5분 */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 1,234 · 12.3K · 4.5M */
export function formatNumber(n: number): string {
  const v = Math.floor(n);
  if (Math.abs(v) < 10_000) return v.toLocaleString('ko-KR');
  let scaled = v;
  let i = 0;
  while (Math.abs(scaled) >= 1000 && i < UNITS.length - 1) {
    scaled /= 1000;
    i++;
  }
  return `${scaled >= 100 ? Math.floor(scaled) : Math.floor(scaled * 10) / 10}${UNITS[i]}`;
}
