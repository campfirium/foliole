import type { TranslationKey } from '../translations';

export type TranslationCatalog = Partial<Record<TranslationKey, string>>;
