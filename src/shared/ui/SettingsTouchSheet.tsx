import type { ComponentProps } from 'react';

import { AppDialogContent, AppDialogOverlay } from './Dialog';
import './settingsTouchSheet.css';

export function SettingsTouchSheet({ className = '', ...props }: ComponentProps<typeof AppDialogContent>) {
  return <AppDialogContent {...props} layout="bare" className={`settings-touch-sheet ${className}`} />;
}

export function SettingsTouchSheetOverlay() {
  return <AppDialogOverlay className="settings-touch-sheet-overlay" />;
}
