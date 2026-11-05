import { getLongClozeFrontGuardMode, getLongClozeFrontGuardThreshold, getLongClozeSelectionGuardMin,
  LONG_CLOZE_GUARD_LIMITS, setLongClozeFrontGuardMode, setLongClozeFrontGuardThreshold,
  setLongClozeSelectionGuardMin } from '../shared/config/longClozeFrontGuardSetting';
import type { TranslationKey } from '../shared/localization/translations';

export interface ClozeGuardSettingField {
  key: string;
  title: TranslationKey;
  description: TranslationKey;
  label: TranslationKey;
  limits?: { min: number; max: number };
  read(): string | number;
  save(value: string): string | number;
}

export const CLOZE_GUARD_SETTING_FIELDS: ClozeGuardSettingField[] = [
  { key: 'mode', title: 'settings.search.editorLongCloze.title',
    description: 'settings.search.editorLongCloze.description', label: 'settings.editor.clozeGuard.actionAria',
    read: getLongClozeFrontGuardMode, save: setLongClozeFrontGuardMode },
  { key: 'selectionMin', title: 'settings.editor.clozeGuard.selectionTitle',
    description: 'settings.editor.clozeGuard.selectionDescription', label: 'settings.editor.clozeGuard.selectionAria',
    limits: LONG_CLOZE_GUARD_LIMITS.selectionMin, read: getLongClozeSelectionGuardMin, save: setLongClozeSelectionGuardMin },
  { key: 'frontMax', title: 'settings.editor.clozeGuard.frontTitle',
    description: 'settings.editor.clozeGuard.frontDescription', label: 'settings.editor.clozeGuard.frontAria',
    limits: LONG_CLOZE_GUARD_LIMITS.frontMax, read: getLongClozeFrontGuardThreshold, save: setLongClozeFrontGuardThreshold }
];

export const CLOZE_GUARD_MODE_LABELS = {
  remind: 'settings.editor.clozeGuard.remind',
  convert: 'settings.editor.clozeGuard.convert',
  off: 'settings.editor.clozeGuard.off'
} as const;
