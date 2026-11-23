import type { ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { inspectorListInsetPaddingClassName, inspectorListMetaClassName } from '../../shared/ui';

import type { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { createAssistantContinuationEvent } from './workspaceRightSidebarAssistantContinuation';
import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';
import {
  resolveAssistantImageError,
  resolveAssistantThreadLoadStatusLabel,
  resolveAssistantThreadPreviewLabel
} from './workspaceRightSidebarAssistantLabels';
import { AssistantProviderAndModelControls } from './WorkspaceRightSidebarAssistantProviderControl';
import { WorkspaceRightSidebarAssistantWriteApproval } from './WorkspaceRightSidebarAssistantWriteApproval';

export function AssistantConversationView(props: {
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  focusRequest: number | null;
  materialTags: ReactNode;
}) {
  const t = useTranslation();
  const continuation = createAssistantContinuationEvent({
    messages: props.controller.activeMessages,
    onSelectRecord: props.controller.handleSelectRecord,
    records: props.controller.records,
    selectedRecord: props.controller.selectedRecord,
    t
  });
  return (
    <>
      {props.controller.selectedThreadNotice ? (
        <p className={`${inspectorListInsetPaddingClassName} py-2 ${inspectorListMetaClassName}`}>
          {props.controller.selectedThreadNotice}
        </p>
      ) : null}
      <WorkspaceRightSidebarAssistantConversation
        activeMessages={props.controller.activeMessages}
        focusRequest={props.focusRequest}
        materialTags={props.materialTags}
        {...(props.controller.writeApproval.approval ? {
          writeApproval: <WorkspaceRightSidebarAssistantWriteApproval
            approval={props.controller.writeApproval.approval}
            onResolve={props.controller.writeApproval.resolve}
          />
        } : {})}
        attachImageLabel={t('desktop.rightPanel.assistant.attachImage')}
        inputLabel={t('desktop.rightPanel.assistant.input')}
        imageErrorText={resolveAssistantImageError(props.controller, t)}
        images={props.controller.imageDrafts}
        messageText={props.controller.messageText}
        modelControl={<AssistantProviderAndModelControls controller={props.controller} />}
        onAddImageFiles={(files) => void props.controller.addImageFiles(files)}
        onEditMessage={props.controller.editMessage}
        onMessageTextChange={props.controller.setMessageText}
        onRemoveImage={props.controller.removeImage}
        onSubmit={props.controller.handleSubmit}
        placeholder={t('desktop.rightPanel.assistant.placeholder')}
        pendingLabel={t('desktop.rightPanel.assistant.pending')}
        removeImageLabel={t('desktop.rightPanel.assistant.removeImage')}
        sendLabel={t('desktop.rightPanel.assistant.send')}
        sending={props.controller.sending}
        statusLabel={resolveAssistantThreadLoadStatusLabel(props.controller, t)}
        transitionEvent={continuation}
        threadPreviewLabel={resolveAssistantThreadPreviewLabel(props.controller, t)}
      />
    </>
  );
}
