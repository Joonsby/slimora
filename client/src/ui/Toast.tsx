import { useGame } from './GameContext';

/** 잠깐 떴다 사라지는 안내 한 줄 (첫 필살기 · 첫 차단 등). 사라지는 시각은 세션이 정한다 */
export function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <p key={toast.id} className={`toast ${toast.tone}`} role="status" aria-live="polite">
      {toast.text}
    </p>
  );
}
