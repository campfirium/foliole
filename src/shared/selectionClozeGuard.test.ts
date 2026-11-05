import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS as keys } from './config/appSettings';
import { resolveLongClozeGuardAction } from './selectionClozeGuard';

beforeEach(() => window.localStorage.clear());

it.each([
  [20, 501, 'cloze'], [21, 500, 'cloze'], [21, 501, 'remind']
])('checks both strict boundaries at selection %i and front %i', (selected, front, expected) => {
  expect(resolveLongClozeGuardAction({ selectionText: 'a'.repeat(Number(selected)), clozeContent: 'b'.repeat(Number(front)) })).toBe(expected);
});

it('checks every selection at zero and trims both lengths', () => {
  window.localStorage.setItem(keys.longClozeFrontGuardSelectionMin, '0');
  expect(resolveLongClozeGuardAction({ selectionText: ' a ', clozeContent: 'b'.repeat(501) })).toBe('remind');
  expect(resolveLongClozeGuardAction({ selectionText: ' a ', clozeContent: ` ${'b'.repeat(500)} ` })).toBe('cloze');
});

it.each(['convert', 'off', 'remind'])('uses customized thresholds for %s', mode => {
  window.localStorage.setItem(keys.longClozeFrontGuardMode, mode);
  window.localStorage.setItem(keys.longClozeFrontGuardSelectionMin, '30');
  window.localStorage.setItem(keys.longClozeFrontGuardFrontMax, '800');
  const payload = { selectionText: 'a'.repeat(31), clozeContent: 'b'.repeat(801) };
  expect(resolveLongClozeGuardAction(payload)).toBe(mode === 'off' ? 'cloze' : mode === 'convert' ? 'highlight' : 'remind');
  expect(resolveLongClozeGuardAction({ ...payload, selectionText: 'a'.repeat(30) })).toBe('cloze');
  expect(resolveLongClozeGuardAction({ ...payload, clozeContent: 'b'.repeat(800) })).toBe('cloze');
});
