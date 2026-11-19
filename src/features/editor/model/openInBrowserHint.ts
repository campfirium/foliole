import type { AppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import { usesMacShortcutProjection } from '../../../shared/platform/runtime/operatingSystem';

export function openInBrowserHint(locale: AppLocale) {
  const controlKey = locale === 'de' ? 'Strg' : 'Ctrl';
  const modifier = usesMacShortcutProjection() ? '⌘' : controlKey;
  return translate(locale, 'desktop.editor.openInBrowserHint', { modifier });
}
