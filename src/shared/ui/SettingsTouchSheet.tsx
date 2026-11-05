import type { ComponentProps } from 'react';

import { AppDialogContent, AppDialogOverlay } from './Dialog';
import './settingsTouchSheet.css';

export function SettingsTouchSheet({ className = '', ...props }: Omit<ComponentProps<typeof AppDialogContent>, 'placement'>) {
  return <AppDialogContent {...props} layout="bare" placement="bottom" className={`settings-touch-sheet ${className}`} />;
}

export function SettingsTouchSheetOverlay() {
  return <AppDialogOverlay className="settings-touch-sheet-overlay" />;
}
