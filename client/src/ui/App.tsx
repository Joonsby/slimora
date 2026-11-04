import { AbsorbSheet } from './AbsorbSheet';
import { BattleLog } from './BattleLog';
import { BattleView } from './BattleView';
import { BottomMenu } from './BottomMenu';
import { DungeonButton } from './DungeonButton';
import { DungeonBar, DungeonHud } from './DungeonHud';
import { DungeonResultModal } from './DungeonResultModal';
import { DungeonResumeModal } from './DungeonResumeModal';
import { DungeonSheet } from './DungeonSheet';
import { EvolveSheet } from './EvolveSheet';
import { MercenarySheet } from './MercenarySheet';
import { useGame } from './GameContext';
import { ChallengeButton, Hud } from './Hud';
import { OfflineRewardModal } from './OfflineRewardModal';
import { RebirthSheet } from './RebirthSheet';
import { ShopSheet } from './ShopSheet';
import { SkillPickModal } from './SkillPickModal';
import { slimeImage } from './portraits';
import { StageSheet } from './StageSheet';
import { Toast } from './Toast';
import { Tutorial } from './Tutorial';
import { UltimateButton } from './UltimateButton';
import { UpgradeSheet } from './UpgradeSheet';

export function App() {
  const ready = useGame((s) => s.ready);
  const inDungeon = useGame((s) => s.dungeon !== null);
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
      {/* 전투 화면이 바탕을 채우고, HUD · 로그 · 버튼은 그 위에 얹는다. 던전 중에는 던전 HUD 와 스킬 막대로 바뀐다 */}
      <main className="stage">
        <BattleView />
        {inDungeon ? (
          <DungeonHud />
        ) : (
          <>
            <Hud />
            <BattleLog />
            <DungeonButton />
            <div className="field-actions">
              <UltimateButton />
              <ChallengeButton />
            </div>
          </>
        )}
      </main>
      {inDungeon ? <DungeonBar /> : <BottomMenu />}
      <UpgradeSheet />
      <StageSheet />
      <AbsorbSheet />
      <EvolveSheet />
      <RebirthSheet />
      <MercenarySheet />
      <ShopSheet />
      <DungeonSheet />
      <SkillPickModal />
      <DungeonResultModal />
      <Tutorial />
      <Toast />
      <OfflineRewardModal />
      <DungeonResumeModal />
    </div>
  );
}
