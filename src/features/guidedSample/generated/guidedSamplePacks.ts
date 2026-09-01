import type { GuidedSampleContentPack } from '../model/guidedSamplePack';

import { DE_GUIDED_SAMPLE_PACK } from './locales/de';
import { EN_GUIDED_SAMPLE_PACK } from './locales/en';
import { ES_GUIDED_SAMPLE_PACK } from './locales/es';
import { FR_GUIDED_SAMPLE_PACK } from './locales/fr';
import { IT_GUIDED_SAMPLE_PACK } from './locales/it';
import { JA_GUIDED_SAMPLE_PACK } from './locales/ja';
import { KO_GUIDED_SAMPLE_PACK } from './locales/ko';
import { PL_GUIDED_SAMPLE_PACK } from './locales/pl';
import { PT_BR_GUIDED_SAMPLE_PACK } from './locales/pt_BR';
import { RU_GUIDED_SAMPLE_PACK } from './locales/ru';
import { ZH_HANS_GUIDED_SAMPLE_PACK } from './locales/zh_Hans';
import { ZH_HANT_GUIDED_SAMPLE_PACK } from './locales/zh_Hant';

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
