import type { Node } from '../features/nodes/model/nodeTypes';
import type { TranslationKey } from '../shared/localization/translations';

export type SplitTopicUnavailableReason = Extract<TranslationKey, `desktop.splitTopic.unavailable.${string}`>;

export function getSplitTopicUnavailableReason(
  node: Pick<Node, 'kind' | 'anchorLink'> | undefined,
  options: { inTrash: boolean; readOnly: boolean }
): SplitTopicUnavailableReason | null {
  if (options.inTrash) return 'desktop.splitTopic.unavailable.trash';
  if (node?.kind === 'item') return 'desktop.splitTopic.unavailable.item';
  if (node?.kind !== 'topic') return 'desktop.splitTopic.unavailable.noTopic';
  if (node.anchorLink) return 'desktop.splitTopic.unavailable.linked';
  if (options.readOnly) return 'desktop.splitTopic.unavailable.readOnly';
  return null;
}
