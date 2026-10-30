import { AbsorbSheet } from './AbsorbSheet';
import { BattleLog } from './BattleLog';
import { BattleView } from './BattleView';
import { BottomMenu } from './BottomMenu';
import { EvolveSheet } from './EvolveSheet';
import { useGame } from './GameContext';
import { ChallengeButton, Hud } from './Hud';
import { slimeImage } from './portraits';
import { StageSheet } from './StageSheet';
import { UpgradeSheet } from './UpgradeSheet';

export function App() {
  const ready = useGame((s) => s.ready);
  if (!ready) {
    return (
      <div className="app loading">
        <img className="loading-slime" src={slimeImage('#86ecc6', null)} alt="" />
        <p>불러오는 중…</p>
      </div>
    );
  }
  return (
    <div className="app">
      {/* 전투 화면이 바탕을 채우고, HUD · 로그 · 도전 버튼은 그 위에 얹는다 */}
      <main className="stage">
        <BattleView />
        <Hud />
        <BattleLog />
        <ChallengeButton />
      </main>
      <BottomMenu />
      <UpgradeSheet />
      <StageSheet />
      <AbsorbSheet />
      <EvolveSheet />
    </div>
  );
}
