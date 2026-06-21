import { describe, expect, it } from 'vitest';

import { EN_SETTINGS_DEMO_PREVIEW_TRANSLATIONS } from './enSettingsDemoPreview';
import { ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS } from './zhHansSettingsDemoPreview';

describe('settings demo preview translations', () => {
  it('keeps zh-Hans coverage for every English demo preview key', () => {
    const missingKeys = Object.keys(EN_SETTINGS_DEMO_PREVIEW_TRANSLATIONS).filter(
      (key) => !Object.prototype.hasOwnProperty.call(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS, key)
    );

    expect(missingKeys).toEqual([]);
  });

  it('uses Chinese text for the demo preview shell keys', () => {
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.banner.title']).toBe('Demo 预览');
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.banner.description']).toBe('这里展示桌面端设置控件，方便了解完整体验。Web Demo 中的更改不会保存。');
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.note.label']).toBe('文件夹访问');
  });
});
