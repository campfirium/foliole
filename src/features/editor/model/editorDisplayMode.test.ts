import { describe, expect, it } from 'vitest';

import {
  EDITOR_DISPLAY_MODE_DEFAULT,
  EDITOR_DISPLAY_MODE_KEY,
  getEditorDisplayMode,
  setEditorDisplayMode
} from './editorDisplayMode';

describe('editorDisplayMode', () => {
  it('defaults to preview when no value is set', () => {
    localStorage.removeItem(EDITOR_DISPLAY_MODE_KEY);
    expect(getEditorDisplayMode()).toBe(EDITOR_DISPLAY_MODE_DEFAULT);
  });

  it('stores and loads valid values', () => {
    setEditorDisplayMode('source');
    expect(getEditorDisplayMode()).toBe('source');

    setEditorDisplayMode('preview');
    expect(getEditorDisplayMode()).toBe('preview');
  });

  it('falls back to default for invalid stored values', () => {
    localStorage.setItem(EDITOR_DISPLAY_MODE_KEY, 'invalid');
    expect(getEditorDisplayMode()).toBe(EDITOR_DISPLAY_MODE_DEFAULT);
  });
});
