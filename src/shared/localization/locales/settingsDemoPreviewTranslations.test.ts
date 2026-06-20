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
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.readOnlyBadge']).toBe('只读 Web 预览');
    expect(ZH_HANS_SETTINGS_DEMO_PREVIEW_TRANSLATIONS['settings.demoPreview.note.label']).toBe('体验版备注');
  });
});
