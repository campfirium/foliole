import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListHeadingClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';
import { WorkspaceRightSidebarAssistantThreadList } from './WorkspaceRightSidebarAssistantThreadList';

export function WorkspaceRightSidebarAssistantPanel(props: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const controller = useWorkspaceRightSidebarAssistantPanelController({
    ...props,
    failedText: t('desktop.rightPanel.assistant.failed'),
    pendingText: t('desktop.rightPanel.assistant.pending')
  });

  return (
    <div className="flex min-h-full flex-col">
      <header className={`${inspectorListInsetPaddingClassName} pb-2 pt-1`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`m-0 ${inspectorListHeadingClassName}`}>
            {t('desktop.rightPanel.assistant')}
          </h2>
          <AppButton
            disabled={controller.selectedThreadId === null}
            onClick={controller.handleNewThread}
            type="button"
          >
            {t('desktop.rightPanel.assistant.newThread')}
          </AppButton>
        </div>
        <p className={inspectorListMetaClassName}>
          {t('desktop.rightPanel.assistant.description')}
        </p>
      </header>
      <WorkspaceRightSidebarAssistantThreadList
        onSelectRecord={controller.handleSelectRecord}
        records={controller.records}
        selectedThreadId={controller.selectedThreadId}
      />
      <AssistantThreadStatus empty={controller.records.length === 0} loading={controller.loading} />
      <WorkspaceRightSidebarAssistantConversation
        activeMessages={controller.activeMessages}
        inputLabel={t('desktop.rightPanel.assistant.input')}
        messageText={controller.messageText}
        onMessageTextChange={controller.setMessageText}
        onSubmit={controller.handleSubmit}
        placeholder={t('desktop.rightPanel.assistant.placeholder')}
        sendLabel={t('desktop.rightPanel.assistant.send')}
        sending={controller.sending}
        sessionLabel={
          controller.selectedRecord && controller.activeMessages.length === 0
            ? t('desktop.rightPanel.assistant.sessionOnly')
            : t('desktop.rightPanel.assistant.currentSession')
        }
      />
    </div>
  );
}

function AssistantThreadStatus(props: { empty: boolean; loading: boolean }) {
  const t = useTranslation();
  const text = props.loading
    ? t('desktop.rightPanel.assistant.loading')
    : props.empty
      ? t('desktop.rightPanel.assistant.empty')
      : null;
  if (!text) return null;
  return (
    <p className={`${inspectorListInsetPaddingClassName} py-3 ${inspectorListMetaClassName}`}>
      {text}
    </p>
  );
}
