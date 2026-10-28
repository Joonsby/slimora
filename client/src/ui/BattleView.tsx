import { useEffect, useRef } from 'react';
import { useGameContext } from './GameContext';

export function BattleView() {
  const { mountBattle } = useGameContext();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // StrictMode 의 이중 마운트에서도 정리 함수가 먼저 게임을 없앤다
    return mountBattle(ref.current);
  }, [mountBattle]);

  return <div className="battle" ref={ref} />;
}
