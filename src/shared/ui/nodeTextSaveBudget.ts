import { assertNodeTextFieldsWithinBudget, assertNodeTextWithinBudget, NodeTextTooLargeError } from '../../../lib/core/nodes/nodeTextBudget';
import { TextBodyTooLargeError } from '../../../lib/core/nodes/textBodyBudget';
import { getStoredAppLocale } from '../localization/appLanguage';
import { translate } from '../localization/translations';

import { showAppRuntimeNotice } from './AppRuntimeNotice';

type TextFields = Parameters<typeof assertNodeTextFieldsWithinBudget>[0] & { kind?: string };

export function isPartitionableNodeBody(node: Pick<TextFields, 'kind' | 'anchorLink'>) {
  return node.kind === 'topic' && !node.anchorLink;
}

export function showNodeTextLimitNotice() {
  showAppRuntimeNotice(translate(getStoredAppLocale(), 'shared.textLimit.exceeded'));
}

export function showNodeTitleShortenedNotice() {
  showAppRuntimeNotice(translate(getStoredAppLocale(), 'shared.titleLimit.shortened'));
}

export function assertNodeTextForSave(node: TextFields) {
  try {
    if (!isPartitionableNodeBody(node)) assertNodeTextWithinBudget(node.content, 'content');
    assertNodeTextFieldsWithinBudget(node);
  } catch (error) {
    if (error instanceof NodeTextTooLargeError || error instanceof TextBodyTooLargeError) showNodeTextLimitNotice();
    throw error;
  }
}

export function canSaveNodeText(node: TextFields) {
  try { assertNodeTextForSave(node); return true; }
  catch (error) {
    if (error instanceof NodeTextTooLargeError || error instanceof TextBodyTooLargeError) return false;
    throw error;
  }
}
