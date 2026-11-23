import { useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { AssistantConversationView } from './WorkspaceRightSidebarAssistantConversationView';
import { AssistantPanelToolbar } from './WorkspaceRightSidebarAssistantHeaders';
import {
  resolveAssistantImageError,
  resolveAssistantConversationTitle
} from './workspaceRightSidebarAssistantLabels';
import { WorkspaceRightSidebarAssistantMaterialTags } from './WorkspaceRightSidebarAssistantMaterialTags';
import { AssistantProviderAndModelControls } from './WorkspaceRightSidebarAssistantProviderControl';
import { WorkspaceRightSidebarAssistantThreadList } from './WorkspaceRightSidebarAssistantThreadList';

export function FolioleAideReadyContent(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  const t = useTranslation();
  const [showHistory, setShowHistory] = useState(true);
  const [newConversationRequest, setNewConversationRequest] = useState<number | null>(null);
  const conversationOpen = newConversationRequest !== null || isConversationOpen(props.controller);
  const closeConversation = () => {
    props.controller.handleNewThread();
    setNewConversationRequest(null);
  };
  return (
    <>
      <AssistantPanelToolbar
        conversationTitle={conversationOpen ? resolveAssistantConversationTitle(props.controller, t) : null}
        historyVisible={!conversationOpen && showHistory}
        newThreadDisabled={props.controller.sending}
        onBack={closeConversation}
        onNewThread={() => {
          props.controller.handleNewThread();
          setNewConversationRequest((current) => (current ?? 0) + 1);
        }}
        onShowHistory={() => {
          if (conversationOpen) {
            closeConversation();
            setShowHistory(true);
          } else {
            setShowHistory((current) => !current);
          }
        }}
      />
      {conversationOpen ? (
        <AssistantConversationView
          controller={props.controller}
          focusRequest={newConversationRequest}
          materialTags={<AssistantMaterialTags {...props} />}
        />
      ) : <AssistantHomeView {...props} historyVisible={showHistory} />}
    </>
  );
}

function AssistantHomeView(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  historyVisible: boolean;
  nodesById: Record<string, Node>;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  const t = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
        {props.historyVisible ? <AssistantHistoryList {...props} /> : null}
      </div>
      <div className={`${inspectorListInsetPaddingClassName} shrink-0 pb-3 pt-2`}>
        <AssistantMaterialTags {...props} />
        <WorkspaceRightSidebarAssistantComposer
          attachImageLabel={t('desktop.rightPanel.assistant.attachImage')}
          inputLabel={t('desktop.rightPanel.assistant.input')}
          imageErrorText={resolveAssistantImageError(props.controller, t)}
          images={props.controller.imageDrafts}
          messageText={props.controller.messageText}
          modelControl={<AssistantProviderAndModelControls controller={props.controller} />}
          onAddImageFiles={(files) => void props.controller.addImageFiles(files)}
          onMessageTextChange={props.controller.setMessageText}
          onRemoveImage={props.controller.removeImage}
          onSubmit={props.controller.handleSubmit}
          placeholder={t('desktop.rightPanel.assistant.placeholder')}
          removeImageLabel={t('desktop.rightPanel.assistant.removeImage')}
          sendLabel={t('desktop.rightPanel.assistant.send')}
          sending={props.controller.sending}
        />
      </div>
    </div>
  );
}


function AssistantHistoryList(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  return (
    <>
      <WorkspaceRightSidebarAssistantThreadList
        onOpenMaterial={props.controller.onOpenMaterial}
        trashedNodeIds={props.trashedNodeIds}
        nodesById={props.nodesById}
        onRemoveRecord={props.controller.handleRemoveRecord}
        onSelectRecord={props.controller.handleSelectRecord}
        records={props.controller.records}
        removingThreadId={props.controller.removingThreadId}
        selectedThreadId={props.controller.selectedThreadId}
      />
      <AssistantThreadStatus
        empty={props.controller.records.length === 0}
        error={props.controller.threadError}
        loading={props.controller.loading}
        onRetry={props.controller.reloadThreads}
      />
    </>
  );
}

function AssistantThreadStatus(props: {
  empty: boolean;
  error: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>['threadError'];
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useTranslation();
  const text = props.loading
    ? t('desktop.rightPanel.assistant.loading')
    : props.error === 'loadFailed'
      ? t('desktop.rightPanel.assistant.historyLoadFailed')
      : props.error === 'removeFailed'
        ? t('desktop.rightPanel.assistant.historyRemoveFailed')
    : props.empty
      ? t('desktop.rightPanel.assistant.empty')
      : null;
  if (!text) return null;
  return (
    <div className={`${inspectorListInsetPaddingClassName} flex items-center gap-2 py-3 ${inspectorListMetaClassName}`}>
      <span className="min-w-0 flex-1">{text}</span>
      {props.error === 'loadFailed' ? (
        <AppButton
          disabled={props.loading}
          onClick={props.onRetry}
          size="sm"
          type="button"
        >
          {t('desktop.rightPanel.assistant.retry')}
        </AppButton>
      ) : null}
    </div>
  );
}

function isConversationOpen(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>
) {
  return controller.selectedThreadId !== null || controller.activeMessages.length > 0 || controller.sending;
}

function AssistantMaterialTags(props: Pick<Parameters<typeof FolioleAideReadyContent>[0],
  'activeNodeId' | 'controller' | 'nodesById' | 'trashedNodeIds'>) {
  const t = useTranslation();
  return (
    <div className="mb-1.5 flex min-w-0 flex-col gap-1">
      {props.controller.materialLinkFailed ? <span role="alert">
        {t('desktop.rightPanel.assistant.materialTag.failed')}
      </span> : null}
      <WorkspaceRightSidebarAssistantMaterialTags
        activeNodeId={props.activeNodeId}
        location={props.controller.materialLocation}
        linkedMaterialIds={props.controller.linkedMaterialIds}
        addMaterial={props.controller.addMaterial}
        removeMaterial={props.controller.removeMaterial}
        draft={!props.controller.selectedRecord}
        busy={props.controller.materialLinkBusy || props.controller.sending}
        nodesById={props.nodesById}
        onOpenMaterial={props.controller.onOpenMaterial}
        trashedNodeIds={props.trashedNodeIds}
      />
    </div>
  );
}
