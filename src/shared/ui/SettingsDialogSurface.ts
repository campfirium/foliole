import { cn } from '@/shared/lib/utils';

type SettingsDialogSurface = 'group' | 'shell';

const SETTINGS_DIALOG_SURFACE_CLASS_NAMES: Record<SettingsDialogSurface, string> = {
  group: 'bg-settings-group',
  shell: 'bg-settings-shell'
};
const settingsDialogSurfaceBaseClassName =
  'border border-settings-outline shadow-settings';

export function settingsDialogSurfaceClassName(className?: string) {
  return cn(settingsDialogSurfaceBaseClassName, SETTINGS_DIALOG_SURFACE_CLASS_NAMES.group, 'rounded-lg', className);
}

export function settingsNestedDialogSurfaceClassName(
  surface: SettingsDialogSurface = 'group',
  className?: string
) {
  return cn(settingsDialogSurfaceBaseClassName, SETTINGS_DIALOG_SURFACE_CLASS_NAMES[surface], 'rounded-lg', className);
}

export function settingsPopoverSurfaceClassName(
  surface: SettingsDialogSurface = 'shell',
  className?: string
) {
  return cn(settingsDialogSurfaceBaseClassName, SETTINGS_DIALOG_SURFACE_CLASS_NAMES[surface], 'rounded-md', className);
}
