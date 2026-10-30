import type { RewardedAds } from '../session/ports';

type Sdk = typeof import('@apps-in-toss/web-framework');

const LOAD_TIMEOUT_MS = 10_000;

/**
 * 앱인토스 보상형 광고 (콘솔에서 만든 광고 그룹 ID). 미리 불러 두고, 보여준 뒤 다음 것을 다시 불러온다.
 * 광고가 재생되는 동안 앱 소리를 멈춰야 하므로 시작 · 끝을 알린다
 */
export function createTossRewardedAds(
  adGroupId: string,
  hooks: { onStart?: () => void; onEnd?: () => void } = {},
  /** devtools 가짜 광고는 전면 광고 이벤트만 보내 보상 이벤트가 오지 않는다 — 개발 서버에서만 닫으면 본 것으로 */
  rewardOnDismiss = false,
): RewardedAds {
  let sdk: Sdk | null = null;
  let ready = false;
  let loading: Promise<boolean> | null = null;

  const getSdk = async () => (sdk ??= await import('@apps-in-toss/web-framework'));

  const load = (): Promise<boolean> => {
    if (ready) return Promise.resolve(true);
    loading ??= getSdk()
      .then(
        ({ loadFullScreenAd }) =>
          new Promise<boolean>((resolve) => {
            if (!loadFullScreenAd.isSupported()) return resolve(false);
            const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
            loadFullScreenAd({
              options: { adGroupId },
              onEvent: (e) => {
                if (e.type !== 'loaded') return;
                clearTimeout(timer);
                ready = true;
                resolve(true);
              },
              onError: () => {
                clearTimeout(timer);
                resolve(false);
              },
            });
          }),
      )
      .catch(() => false)
      .finally(() => (loading = null));
    return loading;
  };

  void load();

  return {
    async show() {
      if (!(await load())) return false;
      const { showFullScreenAd } = await getSdk();
      ready = false;
      hooks.onStart?.();
      const earned = await new Promise<boolean>((resolve) => {
        let reward = false;
        showFullScreenAd({
          options: { adGroupId },
          onEvent: (e) => {
            if (e.type === 'userEarnedReward') reward = true;
            if (e.type === 'dismissed') resolve(reward || rewardOnDismiss);
            if (e.type === 'failedToShow') resolve(false);
          },
          onError: () => resolve(false),
        });
      });
      hooks.onEnd?.();
      void load();
      return earned;
    },
  };
}
