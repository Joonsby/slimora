/**
 * ait build 후처리 — .ait 안의 파일 경로 구분자를 / 로 맞춘다 (npm run build 마지막 단계)
 * ait CLI 3.9.0 은 Windows 에서 경로를 `assets\index.js` 처럼 역슬래시로 담는다.
 * 기기에서는 역슬래시가 폴더 구분자가 아니어서 index.html 이 assets/ 를 찾지 못한다. 경로가 정상이면 그대로 둔다
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppsInTossBundle } from '@apps-in-toss/ait-format';
import config from '../apps-in-toss.config';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(CLIENT, `${config.appName}.ait`);
const reader = AppsInTossBundle.reader(new Uint8Array(readFileSync(file)));
const names = reader.listEntries();
const broken = names.filter((name) => name.includes('\\'));

if (broken.length > 0) {
  // 다시 쓰면 서명이 깨진다. 지금 CLI 는 서명하지 않는다
  if (reader.readSignature()) throw new Error(`${file} 은 서명돼 있어 고칠 수 없다`);

  const fix = (name: string) => name.replaceAll('\\', '/');
  const { bundle, metadata } = reader;
  const writer = AppsInTossBundle.writer({
    appName: bundle.appName,
    deploymentId: bundle.deploymentId,
    formatVersion: bundle.formatVersion,
    createdBy: bundle.createdBy,
  });
  if (metadata) writer.setMetadata({ ...metadata, bundleFiles: metadata.bundleFiles.map(fix) });
  for (const { name, access } of reader.permissions) writer.addPermission(name, access);
  for (const name of names) writer.addFile(fix(name), await reader.readEntry(name));
  writeFileSync(file, await writer.toBuffer());
  console.log(`${config.appName}.ait — 경로 ${broken.length}개의 구분자를 / 로 고쳤다`);
}
