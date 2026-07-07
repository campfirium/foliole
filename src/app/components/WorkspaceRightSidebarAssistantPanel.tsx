import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListHeadingClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { useFolioleAideCapability, type FolioleAideCapabilityState } from './useFolioleAideCapability';
import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';
import { WorkspaceRightSidebarAssistantThreadList } from './WorkspaceRightSidebarAssistantThreadList';

export function WorkspaceRightSidebarAssistantPanel(props: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const capability = useFolioleAideCapability();
  const controller = useWorkspaceRightSidebarAssistantPanelController({
    ...props,
    aideReady: capability.ready,
    failedText: t('desktop.rightPanel.assistant.failed'),
    pendingText: t('desktop.rightPanel.assistant.pending'),
    topicUnavailableText: t('desktop.rightPanel.assistant.location.topicUnavailable')
  });

  return (
    <div className="flex min-h-full flex-col">
      <header className={`${inspectorListInsetPaddingClassName} pb-2 pt-1`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`m-0 ${inspectorListHeadingClassName}`}>
            {t('desktop.rightPanel.assistant')}
          </h2>
          {capability.ready ? (
            <AppButton
              disabled={controller.selectedThreadId === null}
              onClick={controller.handleNewThread}
              type="button"
            >
              {t('desktop.rightPanel.assistant.newThread')}
            </AppButton>
          ) : null}
        </div>
        <p className={inspectorListMetaClassName}>
          {t('desktop.rightPanel.assistant.description')}
        </p>
      </header>
      {!capability.ready ? (
        <FolioleAideCapabilityGate
          onEnable={capability.enable}
          onRetry={capability.retry}
          state={capability.state}
        />
      ) : null}
      {capability.ready ? (
        <FolioleAideReadyContent
          activeNodeId={props.activeNodeId}
          controller={controller}
          nodesById={props.nodesById}
        />
      ) : null}
    </div>
  );
}

function FolioleAideReadyContent(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
}) {
  const t = useTranslation();
  return (
    <>
      <WorkspaceRightSidebarAssistantThreadList
        activeNodeId={props.activeNodeId}
        nodesById={props.nodesById}
        onSelectRecord={props.controller.handleSelectRecord}
        records={props.controller.records}
        selectedThreadId={props.controller.selectedThreadId}
      />
      <AssistantThreadStatus
        empty={props.controller.records.length === 0}
        loading={props.controller.loading}
      />
      {props.controller.selectedThreadNotice ? (
        <p className={`${inspectorListInsetPaddingClassName} py-2 ${inspectorListMetaClassName}`}>
          {props.controller.selectedThreadNotice}
        </p>
      ) : null}
      <WorkspaceRightSidebarAssistantConversation
        activeMessages={props.controller.activeMessages}
        inputLabel={t('desktop.rightPanel.assistant.input')}
        messageText={props.controller.messageText}
        onMessageTextChange={props.controller.setMessageText}
        onSubmit={props.controller.handleSubmit}
        placeholder={t('desktop.rightPanel.assistant.placeholder')}
        sendLabel={t('desktop.rightPanel.assistant.send')}
        sending={props.controller.sending}
        sessionLabel={resolveSessionLabel(props.controller, t)}
      />
    </>
  );
}

function FolioleAideCapabilityGate(props: {
  onEnable: () => void;
  onRetry: () => void;
  state: FolioleAideCapabilityState;
}) {
  const t = useTranslation();
  const checking = props.state === 'checking';
  const enabled = props.state !== 'notEnabled';
  const action = enabled ? props.onRetry : props.onEnable;
  return (
    <section className={`${inspectorListInsetPaddingClassName} py-4`}>
      <p className={`m-0 ${inspectorListMetaClassName}`}>
        {t(getCapabilityDescriptionKey(props.state))}
      </p>
      <AppButton className="mt-3" disabled={checking} onClick={action} type="button">
        {t(getCapabilityActionKey(props.state))}
      </AppButton>
    </section>
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

function resolveSessionLabel(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>,
  t: ReturnType<typeof useTranslation>
) {
  return controller.selectedRecord && controller.activeMessages.length === 0
    ? t('desktop.rightPanel.assistant.sessionOnly')
    : t('desktop.rightPanel.assistant.currentSession');
}

function getCapabilityDescriptionKey(state: FolioleAideCapabilityState) {
  if (state === 'checking') return 'desktop.rightPanel.assistant.checking';
  if (state === 'unavailable') return 'desktop.rightPanel.assistant.unavailable';
  if (state === 'needsCheck') return 'desktop.rightPanel.assistant.needsCheck';
  return 'desktop.rightPanel.assistant.enableDescription';
}

function getCapabilityActionKey(state: FolioleAideCapabilityState) {
  if (state === 'checking') return 'desktop.rightPanel.assistant.checkingAction';
  if (state === 'unavailable') return 'desktop.rightPanel.assistant.retry';
  if (state === 'needsCheck') return 'desktop.rightPanel.assistant.check';
  return 'desktop.rightPanel.assistant.enable';
}
