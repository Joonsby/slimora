import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createInitialProgress } from './core/progression/initial';
import { gameConfig } from './data';
import { validateConfig } from './data/validate';
import { createGame } from './game/createGame';
import { LocalStorageSaveRepository } from './persistence/LocalStorageSaveRepository';
import { createMemoryStorage } from './persistence/MemorySaveRepository';
import { safeLocalStorage, WebPlatform } from './platform/WebPlatform';
import { GameSession } from './session/GameSession';
import { createGameStore, pushLog } from './store/gameStore';
import { App } from './ui/App';
import { attachBattleLog } from './ui/battleLogFeed';
import { GameProvider } from './ui/GameContext';
import './ui/styles.css';

// 조립 지점: 설정 · 스토어 · 저장소 · 플랫폼 → 세션 → 화면
const root = createRoot(document.getElementById('root')!);
const configErrors = validateConfig(gameConfig);

if (configErrors.length > 0) {
  root.render(<pre className="config-error">{`설정 오류\n${configErrors.join('\n')}`}</pre>);
} else {
  const store = createGameStore(createInitialProgress(gameConfig));
  const repo = new LocalStorageSaveRepository(safeLocalStorage() ?? createMemoryStorage());
  const session = new GameSession({ config: gameConfig, store, repo, platform: new WebPlatform() });
  attachBattleLog(session, store, gameConfig);

  const mountBattle = (parent: HTMLElement) => {
    const game = createGame(parent, session);
    return () => game.destroy(true);
  };

  root.render(
    <StrictMode>
      <GameProvider value={{ session, store, config: gameConfig, mountBattle }}>
        <App />
      </GameProvider>
    </StrictMode>,
  );

  void session.start().then((status) => {
    const notice = {
      new: '새 게임을 시작합니다',
      restored: '저장된 진행을 이어갑니다',
      recovered: '저장 데이터가 손상돼 직전 저장본으로 복구했습니다',
      reset: '저장 데이터를 읽을 수 없어 새로 시작합니다',
    }[status];
    pushLog(store, [{ text: notice, tone: status === 'recovered' || status === 'reset' ? 'bad' : 'normal' }]);
  });
}
