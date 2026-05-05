import { matchesShortcutSet } from './shortcuts';
import type { CommandPaletteItem, CommandShortcutSet } from './types';

export interface ResolveCommandShortcutDispatchArgs {
  event: KeyboardEvent;
  ignoredCommandIds?: Iterable<string>;
  items: Pick<CommandPaletteItem, 'enabled' | 'id'>[];
  shortcutMap: Record<string, CommandShortcutSet | undefined>;
}

export function resolveCommandShortcutDispatch({
  event,
  ignoredCommandIds = [],
  items,
  shortcutMap
}: ResolveCommandShortcutDispatchArgs) {
  if (event.defaultPrevented || event.repeat || event.isComposing) {
    return null;
  }

  const ignored = new Set(ignoredCommandIds);
  const matchedItem = items.find(
    (item) =>
      item.enabled &&
      !ignored.has(item.id) &&
      matchesShortcutSet(event, shortcutMap[item.id])
  );
  return matchedItem?.id ?? null;
}
