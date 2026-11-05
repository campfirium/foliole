import type { ComponentProps } from 'react';

import { AppDialogContent } from './Dialog';
import './settingsTouchSheet.css';

export function SettingsTouchSheet({ className = '', ...props }: ComponentProps<typeof AppDialogContent>) {
  return <AppDialogContent {...props} layout="bare" className={`settings-touch-sheet ${className}`} />;
}
