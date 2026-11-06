import { createLucideIcon, PanelLeft, PanelRight } from 'lucide-react';

const CollapsedLeftSidebarIcon = createLucideIcon('CollapsedLeftSidebar', [
  ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2, key: 'frame' }],
  ['path', { d: 'M7 7v10', key: 'panel' }]
]);
const CollapsedRightSidebarIcon = createLucideIcon('CollapsedRightSidebar', [
  ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2, key: 'frame' }],
  ['path', { d: 'M17 7v10', key: 'panel' }]
]);

export function WorkspaceSidebarIcon({ active, side }: { active: boolean; side: 'left' | 'right' }) {
  const Icon = side === 'left'
    ? (active ? PanelLeft : CollapsedLeftSidebarIcon)
    : (active ? PanelRight : CollapsedRightSidebarIcon);
  return <Icon aria-hidden="true" size={16} strokeWidth={1.75} />;
}
