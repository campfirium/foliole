import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListInsetPaddingClassName
} from '../../shared/ui';

import { useFolioleAideCapability, type FolioleAideCapabilityState } from './useFolioleAideCapability';
import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { FolioleAideReadyContent } from './WorkspaceRightSidebarAssistantReadyContent';

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
