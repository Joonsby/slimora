/**
 * 원스토어에 올릴 서명된 APK — gradlew assembleRelease 후 client/release/ 로 복사한다 (npm run build:apk 마지막 단계)
 * 서명 정보 client/android/keystore.properties 가 없으면 빌드하지 않는다. 만드는 법은 README 「안드로이드 빌드」
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(CLIENT, 'android');
const OUT = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release');

if (!existsSync(join(ANDROID, 'keystore.properties'))) {
  console.error('client/android/keystore.properties 가 없어 서명할 수 없다 — README 「안드로이드 빌드」의 서명 키 만들기를 먼저 한다');
  process.exit(1);
}

// 명령줄 gradle 은 SDK 를 local.properties 나 ANDROID_HOME 으로 찾는다. 둘 다 없으면 Android Studio 기본 위치(Windows)
const env = { ...process.env };
const studioSdk = env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android', 'Sdk') : '';
if (!env.ANDROID_HOME && !existsSync(join(ANDROID, 'local.properties')) && existsSync(studioSdk)) env.ANDROID_HOME = studioSdk;

// Windows 의 .bat 은 shell 로만 실행된다. 현재 폴더를 찾지 않는 cmd 설정(NoDefaultCurrentDirectoryInExePath)이 있어 .\ 를 붙이고,
// shell 에 인자 배열을 넘기면 node 가 경고(DEP0190)하므로 명령을 한 줄로 넘긴다
const gradle =
  process.platform === 'win32'
    ? spawnSync('.\\gradlew.bat assembleRelease', { cwd: ANDROID, env, stdio: 'inherit', shell: true })
    : spawnSync('./gradlew', ['assembleRelease'], { cwd: ANDROID, env, stdio: 'inherit' });
if (gradle.status !== 0) process.exit(gradle.status ?? 1);

const meta = JSON.parse(readFileSync(join(OUT, 'output-metadata.json'), 'utf8')) as {
  elements: { outputFile: string; versionCode: number; versionName: string }[];
};
const apk = meta.elements[0];
if (!apk || apk.outputFile.includes('unsigned')) {
  console.error(`${OUT} 에 서명된 APK 가 없다`);
  process.exit(1);
}
const dest = join(CLIENT, 'release', `slimora-${apk.versionName}-${apk.versionCode}.apk`);
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(join(OUT, apk.outputFile), dest);
console.log(`${dest} (${(statSync(dest).size / 1024 / 1024).toFixed(1)}MB, versionCode ${apk.versionCode})`);
