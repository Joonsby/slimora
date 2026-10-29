import { AbsorbSheet } from './AbsorbSheet';
import { BattleLog } from './BattleLog';
import { BattleView } from './BattleView';
import { BottomMenu } from './BottomMenu';
import { EvolveSheet } from './EvolveSheet';
import { useGame } from './GameContext';
import { Hud } from './Hud';
import { StageSheet } from './StageSheet';
import { UpgradeSheet } from './UpgradeSheet';

export function App() {
  const ready = useGame((s) => s.ready);
  if (!ready) return <div className="app loading">불러오는 중…</div>;
  return (
    <div className="app">
      <Hud />
      <BattleView />
      <BattleLog />
      <BottomMenu />
      <UpgradeSheet />
      <StageSheet />
      <AbsorbSheet />
      <EvolveSheet />
    </div>
  );
}
