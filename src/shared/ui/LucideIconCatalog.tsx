import { FileUp, icons, type LucideIcon } from 'lucide-react';

const ICON_BY_ID = icons as Record<string, LucideIcon>;

function iconLabel(id: string) {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export const LUCIDE_ICON_OPTIONS = Object.keys(ICON_BY_ID)
  .filter((id) => !id.endsWith('Icon'))
  .sort((left, right) => left.localeCompare(right))
  .map((id) => ({ id, label: iconLabel(id) }));

export function LucideCatalogIcon({
  iconId,
  size = 16,
  strokeWidth = 1.75
}: {
  iconId?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = iconId ? ICON_BY_ID[iconId] ?? FileUp : FileUp;
  return <Icon aria-hidden="true" size={size} strokeWidth={strokeWidth} />;
}
