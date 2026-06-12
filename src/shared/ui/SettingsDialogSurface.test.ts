import { expect, it } from 'vitest';

import {
  settingsDialogSurfaceClassName,
  settingsNestedDialogSurfaceClassName,
  settingsPopoverSurfaceClassName
} from './SettingsDialogSurface';

it('keeps settings dialogs on the shared settings surface shell', () => {
  expect(settingsDialogSurfaceClassName('grid')).toContain('border-settings-outline');
  expect(settingsDialogSurfaceClassName()).toContain('bg-settings-group');
  expect(settingsDialogSurfaceClassName()).toContain('shadow-settings');
  expect(settingsDialogSurfaceClassName()).toContain('rounded-lg');
  expect(settingsNestedDialogSurfaceClassName()).toBe(settingsDialogSurfaceClassName());
  expect(settingsNestedDialogSurfaceClassName('shell')).toContain('bg-settings-shell');
  expect(settingsNestedDialogSurfaceClassName('shell')).not.toContain('bg-settings-group');
  expect(settingsPopoverSurfaceClassName()).toContain('rounded-md');
  expect(settingsPopoverSurfaceClassName()).toContain('shadow-settings');
});
