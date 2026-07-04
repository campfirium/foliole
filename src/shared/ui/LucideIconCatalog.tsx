import { FileUp, icons, type LucideIcon } from 'lucide-react';

const ICON_BY_ID = icons as Record<string, LucideIcon>;

const LUCIDE_ICON_KEYWORDS: Record<string, string[]> = {
  BotMessageSquare: ['bot', 'chat', 'comment', 'conversation', 'dialog', 'discussion', 'feedback'],
  MessageCircle: ['chat', 'comment', 'conversation', 'dialog', 'discussion', 'feedback', 'speech bubble'],
  MessageSquare: ['chat', 'comment', 'conversation', 'dialog', 'discussion', 'feedback', 'speech bubble'],
  MessagesSquare: ['chat', 'comment', 'conversation', 'copy', 'dialog', 'discuss', 'discussion', 'feedback', 'multiple', 'speech bubbles'],
  Search: ['find', 'lookup', 'magnify', 'magnifying glass'],
  Settings: ['cog', 'configuration', 'preferences', 'sliders'],
  SquarePen: ['compose', 'create', 'edit', 'pencil', 'write'],
  Trash2: ['delete', 'discard', 'remove', 'rubbish']
};

function iconLabel(id: string) {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function kebabIconId(id: string) {
  return iconLabel(id).toLowerCase().replace(/\s+/g, '-');
}

function uniqueSearchTerms(id: string) {
  return [...new Set([id, iconLabel(id), kebabIconId(id), ...(LUCIDE_ICON_KEYWORDS[id] ?? [])])];
}

export const LUCIDE_ICON_OPTIONS = Object.keys(ICON_BY_ID)
  .filter((id) => !id.endsWith('Icon'))
  .sort((left, right) => left.localeCompare(right))
  .map((id) => ({ id, label: iconLabel(id), searchTerms: uniqueSearchTerms(id) }));

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
