import { expect, it } from 'vitest';

import { flowSourceSettingsConflictReason } from './workspaceDailyFlowSourceSettingsActions';

it('reads the conflict guard reason through the desktop IPC error wrapper', () => {
  const wrap = (message: string) => new Error(`Error invoking remote method 'foliole:invoke': Error: ${message}`);
  expect(flowSourceSettingsConflictReason(wrap('daily_flow_source_changed: state_mismatch'))).toBe('state_mismatch');
  expect(flowSourceSettingsConflictReason(wrap('daily_flow_source_changed: source_trashed'))).toBe('source_trashed');
  expect(flowSourceSettingsConflictReason(wrap('daily_flow_source_changed'))).toBe('source_changed');
  expect(flowSourceSettingsConflictReason(wrap('daily_flow_library_changed'))).toBe('library_changed');
  expect(flowSourceSettingsConflictReason(new Error('SQLITE_BUSY: database is locked'))).toBeNull();
});
