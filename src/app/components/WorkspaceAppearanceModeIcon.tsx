import { Moon, Sun, SunMoon } from 'lucide-react';
import { useContext } from 'react';

import { AppearanceSettingsContext } from '../../features/settings/context/appearanceSettingsContext';

export function WorkspaceAppearanceModeIcon({
  showSelectedMode = false,
  size = 16,
  strokeWidth = 1.75
}: {
  showSelectedMode?: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  const appearance = useContext(AppearanceSettingsContext);
  const indicator = showSelectedMode && appearance?.baseColorMode === 'system'
    ? 'system'
    : appearance?.resolvedBaseColorMode ?? 'light';
  const Icon = indicator === 'system' ? SunMoon : indicator === 'dark' ? Moon : Sun;
  return (
    <Icon
      aria-hidden="true"
      data-appearance-indicator={indicator}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
