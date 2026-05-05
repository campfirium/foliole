import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import type { SelectionCommandPayload } from '../contextCommands';

import { resolveLongClozeGuardAction } from './editorClozeGuardrail';

function createPayload(clozeContent: string, selectionText = 'Selected text that looks like a highlight'): SelectionCommandPayload {
  return {
    anchorId: 'anchor-1',
    clozeContent,
    entries: [{
      anchorId: 'anchor-1',
      clozeContent,
      locator: { from: 0, originalText: 'Alpha', to: 5 },
      range: { from: 0, to: 5 },
      selectionText
    }],
    parentNodeId: 'node-1',
    selectionText
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it('allows short cloze fronts', () => {
  expect(resolveLongClozeGuardAction(createPayload('A'.repeat(500)))).toBe('cloze');
});

it('allows short selected text before checking long cloze fronts', () => {
  expect(resolveLongClozeGuardAction(createPayload('A'.repeat(501), 'short selection'))).toBe('cloze');
});

it('checks every cloze when the selected text limit is zero', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardSelectionMin, '0');

  expect(resolveLongClozeGuardAction(createPayload('A'.repeat(501), 'short selection'))).toBe('remind');
});

it('converts long cloze fronts when the guard mode is convert', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardMode, 'convert');

  expect(resolveLongClozeGuardAction(createPayload('A'.repeat(501)))).toBe('highlight');
});

it('requests an app confirmation panel in remind mode', () => {
  expect(resolveLongClozeGuardAction(createPayload('A'.repeat(501)))).toBe('remind');
});
