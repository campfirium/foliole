import type { ReactNode } from 'react';

import './settingsTouchSurface.css';

/** Touch layout for shared settings; the host owns the page's horizontal inset. */
export function SettingsTouchSurface({ children }: { children: ReactNode }) {
  return <div className="settings-touch-surface">{children}</div>;
}
