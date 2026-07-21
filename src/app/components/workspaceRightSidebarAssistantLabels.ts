import type { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';

type AssistantController = ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
type Translation = ReturnType<typeof useTranslation>;

export function resolveAssistantConversationTitle(
  controller: AssistantController,
  t: Translation
) {
  const title = controller.selectedRecord?.title.trim();
  if (title) return title;
  const firstPrompt = controller.activeMessages.find((message) => message.role === 'user')?.text.trim();
  return firstPrompt ? firstPrompt.slice(0, 80) : t('desktop.rightPanel.assistant.newConversation');
}

export function resolveAssistantThreadPreviewLabel(
  controller: AssistantController,
  t: Translation
) {
  if (controller.activeMessages.length > 0) return null;
  const preview = controller.selectedRecord?.preview.trim();
  return preview
    ? t('desktop.rightPanel.assistant.threadPreview', { preview })
    : null;
}

export function resolveAssistantThreadLoadStatusLabel(
  controller: AssistantController,
  t: Translation
) {
  return controller.selectedRecord && controller.threadMessageStatus === 'failed'
    ? t('desktop.rightPanel.assistant.threadMessagesLoadFailed')
    : null;
}

export function resolveAssistantImageError(
  controller: AssistantController,
  t: Translation
) {
  if (controller.imageError === 'count') return t('desktop.rightPanel.assistant.imageError.count');
  if (controller.imageError === 'size') return t('desktop.rightPanel.assistant.imageError.size');
  if (controller.imageError === 'type') return t('desktop.rightPanel.assistant.imageError.type');
  if (controller.imageError === 'read') return t('desktop.rightPanel.assistant.imageError.read');
  return null;
}
