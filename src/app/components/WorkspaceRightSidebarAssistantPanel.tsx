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
      {capability.ready ? (
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
      ) : null}
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
        onRemoveRecord={props.controller.handleRemoveRecord}
        onSelectRecord={props.controller.handleSelectRecord}
        records={props.controller.records}
        removingThreadId={props.controller.removingThreadId}
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
  const statusKey = getCapabilityStatusKey(props.state);
  return (
    <section className={`${inspectorListInsetPaddingClassName} flex flex-1 items-center justify-center py-10`}>
      <div className="mx-auto flex w-full max-w-[13.5rem] -translate-y-[6vh] flex-col items-center text-center">
        <div className="flex flex-col items-center gap-3">
          <h2 className="m-0 text-[26px] font-semibold leading-8 text-foreground/62">
            {t('desktop.rightPanel.assistant')}
          </h2>
          <p className="m-0 text-ui-md leading-6 text-foreground/54">
            {t('desktop.rightPanel.assistant.description')}
          </p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="m-0 text-ui-md leading-6 text-foreground/50">
            {t('desktop.rightPanel.assistant.codexDescription')}
          </p>
          <p className="m-0 text-ui-md leading-6 text-foreground/50">
            {t('desktop.rightPanel.assistant.quotaDescription')}
          </p>
        </div>
        {statusKey ? (
          <p className="m-0 mt-5 max-w-[16rem] text-ui-sm leading-5 text-foreground/50">
            {t(statusKey)}
          </p>
        ) : null}
        <AppButton
          className="mt-6 min-w-32"
          disabled={checking}
          onClick={action}
          size="md"
          type="button"
        >
          {t(getCapabilityActionKey(props.state))}
        </AppButton>
      </div>
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
    ? t('desktop.rightPanel.assistant.selectedThread')
    : t('desktop.rightPanel.assistant.currentSession');
}

function getCapabilityStatusKey(state: FolioleAideCapabilityState) {
  if (state === 'checking') return 'desktop.rightPanel.assistant.checking';
  if (state === 'unavailable') return 'desktop.rightPanel.assistant.unavailable';
  return null;
}

function getCapabilityActionKey(state: FolioleAideCapabilityState) {
  if (state === 'checking') return 'desktop.rightPanel.assistant.checkingAction';
  if (state === 'unavailable') return 'desktop.rightPanel.assistant.retry';
  if (state === 'needsCheck') return 'desktop.rightPanel.assistant.check';
  return 'desktop.rightPanel.assistant.check';
}
