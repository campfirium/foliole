import { describe, expect, it } from 'vitest';

import { APP_LOCALES } from '../../../lib/core/localization/appLocaleRegistry';

import {
  hasTranslationCatalog,
  preloadTranslationCatalog,
  resolveTranslationTemplate,
  safelyLoadTranslationCatalog,
  translate
} from './translations';

const FRONTMATTER_DESCRIPTIONS = {
  de: 'Passen Sie an, welche Felder direkt in der Metadatenleiste des Textkörpers angezeigt werden; die übrigen YAML-Metadaten lassen sich über die Schaltfläche meta in der Leiste aufklappen.',
  en: 'Customize which fields appear directly in the body metadata bar; use the meta button in the bar to expand the remaining YAML metadata.',
  es: 'Personaliza los campos que se muestran directamente en la barra de metadatos del cuerpo; el resto de los metadatos YAML se puede desplegar con el botón meta de la barra.',
  fr: 'Personnalisez les champs affichés directement dans la barre de métadonnées du corps du texte ; les autres métadonnées YAML peuvent être développées avec le bouton meta de la barre.',
  it: 'Personalizza i campi mostrati direttamente nella barra dei metadati del corpo; gli altri metadati YAML possono essere espansi con il pulsante meta nella barra.',
  ja: '本文のメタデータ欄に直接表示するフィールドをカスタマイズします。その他の YAML メタデータは、欄内の meta ボタンから展開できます。',
  ko: '본문 메타데이터 표시줄에 직접 표시할 필드를 사용자 지정합니다. 나머지 YAML 메타데이터는 표시줄의 meta 버튼으로 펼쳐 볼 수 있습니다.',
  pl: 'Dostosuj pola wyświetlane bezpośrednio na pasku metadanych treści; pozostałe metadane YAML można rozwinąć przyciskiem meta na pasku.',
  'pt-BR': 'Personalize os campos exibidos diretamente na barra de metadados do corpo; os demais metadados YAML podem ser expandidos pelo botão meta na barra.',
  ru: 'Настройте поля, которые отображаются непосредственно на панели метаданных текста; остальные метаданные YAML можно развернуть кнопкой meta на панели.',
  'zh-Hans': '自定义正文元信息栏中直接显示的字段；其余 YAML 元信息可通过栏内的 meta 按钮展开查看。',
  'zh-Hant': '自訂正文元資訊欄中直接顯示的欄位；其餘 YAML 元資訊可透過欄內的 meta 按鈕展開查看。'
} satisfies Record<(typeof APP_LOCALES)[number], string>;

describe('translation catalog loading', () => {
  it('falls back to English before a target catalog is available', () => {
    expect(translate('de', 'settings.title')).toBe('Settings');
    expect(resolveTranslationTemplate({}, 'settings.title')).toBeUndefined();
  });

  it('loads every target catalog independently', async () => {
    for (const locale of APP_LOCALES) {
      expect(await preloadTranslationCatalog(locale)).toBe(true);
      expect(hasTranslationCatalog(locale)).toBe(true);
    }
  });

  it('keeps a rejected catalog load recoverable', async () => {
    await expect(safelyLoadTranslationCatalog(() => Promise.reject(new Error('missing chunk'))))
      .resolves.toBeNull();
    expect(translate('en', 'settings.title')).toBe('Settings');
  });

  it('describes the visible metadata fields and meta expansion in every locale', async () => {
    for (const locale of APP_LOCALES) {
      await preloadTranslationCatalog(locale);
      expect(translate(locale, 'settings.search.editorFrontmatter.description')).toBe(FRONTMATTER_DESCRIPTIONS[locale]);
      expect(translate(locale, 'settings.editor.frontmatter.description')).toBe(FRONTMATTER_DESCRIPTIONS[locale]);
    }
    expect(translate('zh-Hans', 'settings.search.editorFrontmatter.title')).toBe('文档元信息');
  });
});
