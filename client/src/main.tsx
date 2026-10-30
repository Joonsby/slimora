import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { attachBattleSfx } from './audio/battleSfx';
import { Sfx } from './audio/sfx';
import { createInitialProgress } from './core/progression/initial';
import { findProduct } from './core/progression/shop';
import { gameConfig } from './data';
import { validateConfig } from './data/validate';
import { createGame } from './game/createGame';
import { HttpCloudSaveStore } from './persistence/HttpCloudSaveStore';
import { LocalStorageSaveRepository } from './persistence/LocalStorageSaveRepository';
import { createMemoryStorage } from './persistence/MemorySaveRepository';
import { installAndroidBackButton } from './platform/androidBackButton';
import { createOneStoreShop } from './platform/oneStoreShop';
import { createTossRewardedAds } from './platform/tossAds';
import { createTossLeaderboard } from './platform/tossLeaderboard';
import { createTossShop } from './platform/tossShop';
import { inTossApp, tossAuthCode } from './platform/tossUser';
import { safeLocalStorage, WebPlatform } from './platform/WebPlatform';
import { CloudSync } from './session/cloudSync';
import { GameSession } from './session/GameSession';
import { attachRanking } from './session/rankingSync';
import type { CloudSaveStore, RewardedAds, ShopStore } from './session/ports';
import { createGameStore, openSheet, pushLog } from './store/gameStore';
import { App } from './ui/App';
import { attachBattleLog } from './ui/battleLogFeed';
import { GameProvider } from './ui/GameContext';
import './ui/styles.css';

// 조립 지점: 설정 · 스토어 · 저장소 · 플랫폼 → 세션 → 화면
const root = createRoot(document.getElementById('root')!);
const SAVE_API_URL = import.meta.env.VITE_SAVE_API_URL ?? 'https://slimora.fit-plate.com';

/** 서버 저장은 토스 앱 안에서만 쓴다 (원스토어 앱 · 브라우저는 기기 저장만) */
function createCloudStore(): CloudSaveStore | null {
  const devUser = import.meta.env.DEV ? import.meta.env.VITE_SAVE_DEV_USER : undefined;
  if (devUser) return new HttpCloudSaveStore(SAVE_API_URL, async () => ({ kind: 'dev', userKey: devUser }));
  if (!inTossApp()) return null;
  return new HttpCloudSaveStore(SAVE_API_URL, async () => ({ kind: 'toss', authCode: await tossAuthCode() }));
}
/** 앱인토스 보상형 광고. 콘솔에서 만든 광고 그룹 ID 가 있어야 켜진다 (개발 서버는 devtools 가짜 광고) */
function createAds(sfx: Sfx): RewardedAds | null {
  const adGroupId = import.meta.env.VITE_AIT_REWARD_AD_ID ?? (import.meta.env.DEV ? 'dev-reward' : undefined);
  if (!adGroupId || !(import.meta.env.DEV || inTossApp())) return null;
  // 광고가 재생되는 동안 앱 소리를 멈춘다 (앱인토스 광고 가이드)
  return createTossRewardedAds(adGroupId, { onStart: () => sfx.setSuspended(true), onEnd: () => sfx.setSuspended(false) }, import.meta.env.DEV);
}

/** 결제: 안드로이드 앱은 원스토어, 토스 앱(개발 서버는 devtools 가짜 결제)은 앱인토스 인앱결제 */
function createShop(): ShopStore | null {
  if (Capacitor.getPlatform() === 'android') return createOneStoreShop((sku) => findProduct(gameConfig, sku)?.adPass === true);
  if (import.meta.env.DEV || inTossApp()) return createTossShop();
  return null;
}

const configErrors = validateConfig(gameConfig);

if (configErrors.length > 0) {
  root.render(<pre className="config-error">{`설정 오류\n${configErrors.join('\n')}`}</pre>);
} else {
  const store = createGameStore(createInitialProgress(gameConfig));
  const repo = new LocalStorageSaveRepository(safeLocalStorage() ?? createMemoryStorage());
  const platform = new WebPlatform();
  const session = new GameSession({ config: gameConfig, store, repo, platform });
  const cloud = createCloudStore();
  const sync = cloud
    ? new CloudSync({
        cloud,
        session,
        platform,
        onAdopted: () => {
          // 다른 기기의 저장으로 바뀌었으니 이 기기 기준의 오프라인 보상 창은 닫는다
          session.dismissOffline();
          pushLog(store, [{ text: '서버에 저장된 진행을 불러왔습니다', tone: 'good' }]);
        },
      })
    : null;
  const sfx = new Sfx();
  const ads = createAds(sfx);
  const shop = createShop();
  // 랭킹은 토스 게임센터 리더보드 — 토스 앱 안(개발 서버는 devtools 가짜)에서만
  const leaderboard = import.meta.env.DEV || inTossApp() ? createTossLeaderboard() : null;
  if (leaderboard) attachRanking(session, store, leaderboard);
  attachBattleLog(session, store, gameConfig);
  attachBattleSfx(session, store, sfx);
  // 뒤로가기: 열린 창 · 시트가 있으면 닫고, 없으면 앱을 백그라운드로
  installAndroidBackButton(() => {
    const s = store.getState();
    if (s.offline) session.dismissOffline();
    else if (s.sheet !== 'none') openSheet(store, 'none');
    else return false;
    return true;
  });

  const mountBattle = (parent: HTMLElement) => {
    const game = createGame(parent, session);
    return () => game.destroy(true);
  };

  root.render(
    <StrictMode>
      <GameProvider value={{ session, store, config: gameConfig, mountBattle, ads, sfx, leaderboard, shop }}>
        <App />
      </GameProvider>
    </StrictMode>,
  );

  void (async () => {
    const status = await session.start();
    const notice = {
      new: '새 게임을 시작합니다',
      restored: '저장된 진행을 이어갑니다',
      recovered: '저장 데이터가 손상돼 직전 저장본으로 복구했습니다',
      reset: '저장 데이터를 읽을 수 없어 새로 시작합니다',
    }[status];
    pushLog(store, [{ text: notice, tone: status === 'recovered' || status === 'reset' ? 'bad' : 'normal' }]);

    // 기기 저장으로 먼저 시작하고, 서버와는 뒤에서 맞춘다
    const cloudStatus = await sync?.start();
    if (cloudStatus === 'failed') pushLog(store, [{ text: '서버에 연결하지 못해 이 기기에만 저장합니다', tone: 'bad' }]);
    if (cloudStatus === 'outdated') pushLog(store, [{ text: '앱을 업데이트해야 서버에 저장됩니다', tone: 'bad' }]);

    // 결제는 됐는데 지급 전에 앱이 꺼진 주문. 서버 저장과 맞춘 뒤에 지급해야 덮이지 않는다
    await shop?.restore((sku, orderId) => session.grantOrder(sku, orderId));
  })();
}
