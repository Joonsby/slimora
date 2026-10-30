import type { CloudPutResult, CloudSave, CloudSaveStore, SaveEnvelope } from '../session/ports';

/** 로그인 방법. 토스 미니앱이면 일회용 인증 코드, 개발 서버면 시험용 사용자 키 */
export type CloudLogin = { kind: 'toss'; authCode: string } | { kind: 'dev'; userKey: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

interface StoredSave {
  save: SaveEnvelope;
  version: number;
}

/** slimora-api 의 저장 API. 세션 토큰은 메모리에만 두고, 만료되면 한 번 다시 로그인한다 */
export class HttpCloudSaveStore implements CloudSaveStore {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly login: () => Promise<CloudLogin>,
    private readonly http: Fetch = (url, init) => fetch(url, init),
  ) {}

  async load(): Promise<CloudSave | null> {
    const res = await this.call('GET', '/v1/save');
    if (res.status === 404) return null;
    return toCloudSave(await this.read(res));
  }

  async save(envelope: SaveEnvelope, baseVersion: number, urgent: boolean): Promise<CloudPutResult> {
    // 화면이 닫히는 중이면 keepalive 로 보내 페이지가 사라져도 요청이 끝까지 가게 한다
    const res = await this.call('PUT', '/v1/save', { save: envelope, baseVersion }, urgent);
    if (res.status === 409) {
      const body = (await res.json()) as { error?: string; current?: unknown };
      if (body.error === 'schema_outdated') return { status: 'outdated' };
      return { status: 'conflict', current: body.current ? toCloudSave(body.current) : null };
    }
    const { version } = (await this.read(res)) as { version?: unknown };
    if (typeof version !== 'number') throw new Error('서버 저장: 응답 형식이 다르다');
    return { status: 'ok', version };
  }

  private async call(method: string, path: string, body?: unknown, keepalive = false): Promise<Response> {
    const send = async () =>
      this.http(this.baseUrl + path, {
        method,
        headers: { authorization: `Bearer ${(this.token ??= await this.signIn())}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        keepalive,
      });
    const res = await send();
    if (res.status !== 401) return res;
    this.token = null;
    return send();
  }

  private async signIn(): Promise<string> {
    const login = await this.login();
    const [path, body] = login.kind === 'toss' ? ['/v1/auth/toss', { authCode: login.authCode }] : ['/v1/auth/dev', { userKey: login.userKey }];
    const res = await this.http(this.baseUrl + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const { token } = (await this.read(res)) as { token?: unknown };
    if (typeof token !== 'string') throw new Error('서버 저장: 로그인 응답 형식이 다르다');
    return token;
  }

  private async read(res: Response): Promise<unknown> {
    if (!res.ok) throw new Error(`서버 저장: ${res.status}`);
    return res.json();
  }
}

function toCloudSave(value: unknown): CloudSave {
  const v = value as Partial<StoredSave>;
  if (typeof v.version !== 'number' || typeof v.save !== 'object' || v.save === null || typeof v.save.schemaVersion !== 'number') {
    throw new Error('서버 저장: 저장 형식이 다르다');
  }
  return { envelope: v.save, version: v.version };
}
