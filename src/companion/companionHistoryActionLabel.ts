import type { Translate } from '../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../shared/localization/translations';
import type { CompanionHistoryTop } from '../shared/platform/companion/runtime/companionFlowHistoryStore';

const byType: Record<string, TranslationKey> = {
  'review.grade': 'companion.history.action.grade',
  'topic.dismiss': 'companion.history.action.dismiss',
  'topic.shelve': 'companion.history.action.shelve'
};

const byTitle: [RegExp, TranslationKey][] = [
  [/^(Move to Trash|Delete)$/i, 'companion.history.action.delete'],
  [/^(Restore|Restore from Trash)$/i, 'companion.history.action.restore'],
  [/^rename$/i, 'companion.history.action.rename'],
  [/^move$/i, 'companion.history.action.move'],
  [/^shelve$/i, 'companion.history.action.shelve'],
  [/^unshelve$/i, 'companion.history.action.unshelve'],
  [/^set-priority$/i, 'companion.history.action.priority'],
  [/^Create/i, 'companion.history.action.create'],
  [/^Import/i, 'companion.history.action.import']
];

/** A short verb naming the history step, so the button reads like iOS "Undo Typing". */
export function resolveCompanionHistoryActionKey(top: CompanionHistoryTop): TranslationKey | null {
  if (!top) return null;
  if (top.type && byType[top.type]) return byType[top.type]!;
  const title = top.title ?? '';
  return byTitle.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}

export function resolveCompanionHistoryLabel(mode: 'undo' | 'redo', top: CompanionHistoryTop, t: Translate) {
  const action = resolveCompanionHistoryActionKey(top);
  if (!action) return t(mode === 'undo' ? 'desktop.command.undo' : 'desktop.command.redo');
  return t(mode === 'undo' ? 'companion.history.undoAction' : 'companion.history.redoAction', { action: t(action) });
}
