import { describe, expect, it } from 'vitest';
import type { SaveEnvelope } from '../session/ports';
import { HttpCloudSaveStore } from './HttpCloudSaveStore';

const envelope: SaveEnvelope = { schemaVersion: 3, configVersion: 'test', savedAt: 1, data: { installId: 'a', progress: {} } };

type Call = { url: string; init: RequestInit };

/** 응답을 차례로 돌려주는 가짜 fetch */
function fakeHttp(...responses: [number, unknown][]) {
  const calls: Call[] = [];
  const http = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = responses.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  };
  return { http, calls };
}

const header = (c: Call | undefined) => (c?.init.headers as Record<string, string> | undefined)?.authorization;

describe('HttpCloudSaveStore', () => {
  it('처음 부를 때 토스 인증 코드로 로그인하고, 저장이 없으면 null', async () => {
    const { http, calls } = fakeHttp([200, { token: 't1' }], [404, { error: 'not_found' }]);
    const store = new HttpCloudSaveStore('https://api.test', async () => ({ kind: 'toss', authCode: 'code' }), http);
    expect(await store.load()).toBeNull();
    expect(calls[0]).toMatchObject({ url: 'https://api.test/v1/auth/toss', init: { method: 'POST', body: '{"authCode":"code"}' } });
    expect(calls[1]?.url).toBe('https://api.test/v1/save');
    expect(header(calls[1])).toBe('Bearer t1');
  });

  it('토큰이 만료되면(401) 한 번 다시 로그인한다', async () => {
    const { http, calls } = fakeHttp([200, { token: 't1' }], [401, {}], [200, { token: 't2' }], [200, { save: envelope, version: 7 }]);
    const store = new HttpCloudSaveStore('https://api.test', async () => ({ kind: 'dev', userKey: 'me' }), http);
    expect(await store.load()).toEqual({ envelope, version: 7 });
    expect(calls.map((c) => c.url.replace('https://api.test', ''))).toEqual(['/v1/auth/dev', '/v1/save', '/v1/auth/dev', '/v1/save']);
    expect(header(calls[3])).toBe('Bearer t2');
  });

  it('저장: 성공 · 충돌 · 형식이 낮음을 구분한다. 급할 때는 keepalive', async () => {
    const { http, calls } = fakeHttp(
      [200, { token: 't' }],
      [200, { version: 2, updatedAt: 'x' }],
      [409, { error: 'conflict', current: { save: envelope, version: 5 } }],
      [409, { error: 'schema_outdated', current: { save: envelope, version: 5 } }],
    );
    const store = new HttpCloudSaveStore('https://api.test', async () => ({ kind: 'dev', userKey: 'me' }), http);
    expect(await store.save(envelope, 1, true)).toEqual({ status: 'ok', version: 2 });
    expect(calls[1]?.init).toMatchObject({ method: 'PUT', keepalive: true });
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ save: envelope, baseVersion: 1 });
    expect(await store.save(envelope, 1, false)).toEqual({ status: 'conflict', current: { envelope, version: 5 } });
    expect(await store.save(envelope, 1, false)).toEqual({ status: 'outdated' });
  });

  it('서버 오류는 throw — 기기 저장은 그대로 두고 다음에 다시 한다', async () => {
    const { http } = fakeHttp([200, { token: 't' }], [500, { error: 'internal' }]);
    const store = new HttpCloudSaveStore('https://api.test', async () => ({ kind: 'dev', userKey: 'me' }), http);
    await expect(store.load()).rejects.toThrow('500');
  });
});
