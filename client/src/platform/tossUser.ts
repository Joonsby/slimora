/** 토스 앱 웹뷰 안인가. 밖(브라우저 · 안드로이드 앱)에서는 SDK 호출이 오류를 던진다 */
export function inTossApp(): boolean {
  return (window as { ReactNativeWebView?: unknown }).ReactNativeWebView != null;
}

/** 서버가 토스와 교환해 사용자 식별키를 받는 일회용 코드. SDK 는 토스 안에서만 불러온다 */
export async function tossAuthCode(): Promise<string> {
  const { User } = await import('@apps-in-toss/web-framework');
  return (await User.createAnonymousKeyAuthCode()).code;
}
