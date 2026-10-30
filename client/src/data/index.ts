import type { GameConfig } from '../core/model/config';
import balance from './balance.json';
import chapterData from './chapters.json';
import { expandChapters, type ChapterSource } from './chapters';
import families from './families.json';
import forms from './forms.json';
import legacy from './legacy.json';
import mercenaries from './mercenaries.json';
import shop from './shop.json';
import monsters from './monsters.json';
import traits from './traits.json';
import upgrades from './upgrades.json';

const { configVersion, ...balanceValues } = balance;
const { chapters, stages } = expandChapters(chapterData as ChapterSource[]);

/** JSON 은 타입 검사가 약하다. 형태는 validateConfig 가 테스트에서 확인한다 */
export const gameConfig = {
  configVersion,
  balance: balanceValues,
  families,
  monsters,
  chapters,
  stages,
  upgrades,
  traits,
  forms,
  legacy,
  mercenaries,
  shop,
} as unknown as GameConfig;
