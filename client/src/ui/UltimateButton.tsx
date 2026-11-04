import { useEffect, useState } from 'react';
import { useGameContext } from './GameContext';
import { IconUltimate } from './icons';

const R = 30;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** 필살기 버튼 하나 — 게이지가 원을 따라 차고, 다 차면 빛나며 누를 수 있다. 사냥터 · 던전 공용 */
export function UltimateButton({ big = false }: { big?: boolean }) {
  const { session } = useGameContext();
  const [gauge, setGauge] = useState(() => session.ultimateGauge());
  useEffect(() => {
    const id = setInterval(() => setGauge(session.ultimateGauge()), 100);
    return () => clearInterval(id);
  }, [session]);
  const ratio = Math.min(1, gauge.charge / gauge.max);
  const ready = ratio >= 1;
  return (
    <button
      className={`ult-btn ${big ? 'big' : ''} ${ready ? 'ready' : ''} ${gauge.usable ? 'usable' : ''}`}
      disabled={!gauge.usable}
      onClick={() => {
        if (session.useUltimate()) setGauge(session.ultimateGauge());
      }}
      aria-label={ready ? '필살기 쓰기' : `필살기 충전 ${Math.floor(ratio * 100)}%`}
    >
      <svg viewBox="0 0 72 72" className="ult-ring" aria-hidden="true">
        <circle cx="36" cy="36" r={R} className="ult-track" />
        <circle cx="36" cy="36" r={R} className="ult-fill" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - ratio)} />
      </svg>
      <span className="ult-core">
        <IconUltimate size={big ? 36 : 28} />
      </span>
      <span className="ult-label">{ready ? '필살기!' : `${Math.floor(ratio * 100)}%`}</span>
    </button>
  );
}
