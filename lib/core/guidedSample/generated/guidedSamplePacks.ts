import type { GuidedSampleContentPack } from '../guidedSamplePack.js';

import { DE_GUIDED_SAMPLE_PACK } from './locales/de.js';
import { EN_GUIDED_SAMPLE_PACK } from './locales/en.js';
import { ES_GUIDED_SAMPLE_PACK } from './locales/es.js';
import { FR_GUIDED_SAMPLE_PACK } from './locales/fr.js';
import { IT_GUIDED_SAMPLE_PACK } from './locales/it.js';
import { JA_GUIDED_SAMPLE_PACK } from './locales/ja.js';
import { KO_GUIDED_SAMPLE_PACK } from './locales/ko.js';
import { PL_GUIDED_SAMPLE_PACK } from './locales/pl.js';
import { PT_BR_GUIDED_SAMPLE_PACK } from './locales/pt_BR.js';
import { RU_GUIDED_SAMPLE_PACK } from './locales/ru.js';
import { ZH_HANS_GUIDED_SAMPLE_PACK } from './locales/zh_Hans.js';
import { ZH_HANT_GUIDED_SAMPLE_PACK } from './locales/zh_Hant.js';

export const GENERATED_GUIDED_SAMPLE_PACKS: Record<string, GuidedSampleContentPack> = {
  "en": EN_GUIDED_SAMPLE_PACK,
  "de": DE_GUIDED_SAMPLE_PACK,
  "es": ES_GUIDED_SAMPLE_PACK,
  "fr": FR_GUIDED_SAMPLE_PACK,
  "it": IT_GUIDED_SAMPLE_PACK,
  "ja": JA_GUIDED_SAMPLE_PACK,
  "ko": KO_GUIDED_SAMPLE_PACK,
  "pl": PL_GUIDED_SAMPLE_PACK,
  "pt-BR": PT_BR_GUIDED_SAMPLE_PACK,
  "ru": RU_GUIDED_SAMPLE_PACK,
  "zh-Hans": ZH_HANS_GUIDED_SAMPLE_PACK,
  "zh-Hant": ZH_HANT_GUIDED_SAMPLE_PACK
};
