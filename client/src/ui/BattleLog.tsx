import { useState } from 'react';
import { useGame } from './GameContext';

export function BattleLog() {
  const log = useGame((s) => s.log);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? [...log].reverse() : log.slice(-2);

  return (
    <section className={`log ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded((v) => !v)} aria-label="전투 로그 (누르면 펼침)">
      {shown.length === 0 && <p className="log-line muted">전투 기록이 여기에 쌓입니다</p>}
      {shown.map((entry) => (
        <p key={entry.id} className={`log-line ${entry.tone}`}>
          {entry.text}
        </p>
      ))}
    </section>
  );
}
