import { useState } from 'react';
import { useGame } from './GameContext';

/** 전투 화면 왼쪽 아래의 짧은 기록. 누르면 펼친다 */
export function BattleLog() {
  const log = useGame((s) => s.log);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? [...log].reverse() : log.slice(-2);

  return (
    <section className={`log ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded((v) => !v)} aria-label="전투 기록 (누르면 펼침)">
      {expanded && <h3>전투 기록</h3>}
      {shown.map((entry) => (
        <p key={entry.id} className={`log-line ${entry.tone}`}>
          {entry.text}
        </p>
      ))}
    </section>
  );
}
