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
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.banner.title']).toBe('桌面端设置预览');
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.banner.description']).toBe('本面板展示桌面版的完整设置，方便了解 Foliole 的功能结构。这里的调整不会影响在线体验版。');
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.note.label']).toBe('文件夹访问');
  });
});
