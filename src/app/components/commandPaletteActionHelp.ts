import { HELP_KNOWLEDGE_ITEMS, queryHelpKnowledge } from '../../features/help/model/helpKnowledge';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { localizeActionHelpCopy } from '../../shared/ui/actionHelpLocalization';

import type { PaletteSection } from './CommandPaletteList';

export function buildPaletteActionHelpSection(query: string, t: Translate): PaletteSection | null {
  if (!query.trim()) return null;
  const tips = HELP_KNOWLEDGE_ITEMS.map((item) => localizeActionHelpCopy(t, item));
  const matches = queryHelpKnowledge(query, tips);
  if (!matches.length) return null;

  return {
    id: 'action-tips',
    title: t('desktop.palette.command.actionTips'),
    items: matches.map((tip) => ({
      id: tip.id,
      title: tip.title,
      enabled: true,
      subtitle: tip.sourceLabel,
      tip
    }))
  };
}
