import type { NativeAssistantWorkspaceContext } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListInsetPaddingClassName
} from '../../shared/ui';

import {
  useFolioleAideCapability,
  type FolioleAideCapabilityDiagnostic,
  type FolioleAideCapabilityState,
  type FolioleAideCapabilityUnavailableReason
} from './useFolioleAideCapability';
import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import { FolioleAideReadyContent } from './WorkspaceRightSidebarAssistantReadyContent';

export function WorkspaceRightSidebarAssistantPanel(props: {
  activeNodeId: string | null;
  editorAdapterRef?: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
}) {
  const t = useTranslation();
  const capability = useFolioleAideCapability();
  const controller = useWorkspaceRightSidebarAssistantPanelController({
    ...props,
    aideReady: capability.ready,
    failedText: t('desktop.rightPanel.assistant.failed'),
    onCapabilityFailure: capability.markUnavailableFromFailure,
    topicUnavailableText: t('desktop.rightPanel.assistant.location.topicUnavailable')
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!capability.ready ? (
        <FolioleAideCapabilityGate
          onEnable={capability.enable}
          onRetry={capability.retry}
          onSignIn={capability.signIn}
          diagnostic={capability.diagnostic}
          reason={capability.unavailableReason}
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
  diagnostic: FolioleAideCapabilityDiagnostic | null;
  onEnable: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  reason: FolioleAideCapabilityUnavailableReason | null;
  state: FolioleAideCapabilityState;
}) {
  const t = useTranslation();
  const checking = props.state === 'checking';
  const enabled = props.state !== 'notEnabled';
  const action = props.reason === 'auth_failed'
    ? props.onSignIn
    : enabled ? props.onRetry : props.onEnable;
  const needsSignIn = props.reason === 'auth_failed';
  const statusKey = getCapabilityStatusKey(props.state, props.reason);
  return (
    <section className={`${inspectorListInsetPaddingClassName} flex flex-1 items-center justify-center py-10`}>
      <div className="mx-auto flex w-full max-w-[13.5rem] -translate-y-[6vh] flex-col items-center text-center">
        <div className="flex flex-col items-center gap-3">
          <h2 className="m-0 text-[26px] font-semibold leading-8 text-foreground/62">
            {t('desktop.rightPanel.assistant.title')}
          </h2>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="m-0 text-ui-md leading-6 text-foreground/50">
            {t('desktop.rightPanel.assistant.codexDescription')}
          </p>
          {needsSignIn ? (
            <p className="m-0 text-ui-md leading-6 text-foreground/50">
              {t('desktop.rightPanel.assistant.signInDescription')}
            </p>
          ) : null}
        </div>
        {statusKey ? (
          <p className="m-0 mt-5 max-w-[16rem] text-ui-sm leading-5 text-foreground/50">
            {t(statusKey)}
          </p>
        ) : null}
        {props.state === 'unavailable' && props.diagnostic && !needsSignIn ? (
          <FolioleAideDiagnosticText diagnostic={props.diagnostic} />
        ) : null}
        <AppButton
          className="mt-6 min-w-32"
          disabled={checking}
          onClick={action}
          size="md"
          type="button"
        >
          {t(getCapabilityActionKey(props.state, props.reason))}
        </AppButton>
      </div>
    </section>
  );
}

function FolioleAideDiagnosticText(props: {
  diagnostic: FolioleAideCapabilityDiagnostic;
}) {
  const t = useTranslation();
  return (
    <>
      <p className="m-0 mt-2 max-w-[16rem] text-ui-xs leading-5 text-foreground/45">
        {t('desktop.rightPanel.assistant.diagnostic', {
          codex: t(getCodexDiagnosticKey(props.diagnostic.codex)),
          tools: t(getToolsDiagnosticKey(props.diagnostic.tools))
        })}
      </p>
    </>
  );
}

function getCodexDiagnosticKey(state: FolioleAideCapabilityDiagnostic['codex']) {
  if (state === 'authFailed') return 'desktop.rightPanel.assistant.diagnostic.codex.authFailed';
  if (state === 'busy') return 'desktop.rightPanel.assistant.diagnostic.codex.busy';
  if (state === 'launchFailed') return 'desktop.rightPanel.assistant.diagnostic.codex.launchFailed';
  if (state === 'notConfigured') return 'desktop.rightPanel.assistant.diagnostic.codex.notConfigured';
  if (state === 'ready') return 'desktop.rightPanel.assistant.diagnostic.codex.ready';
  if (state === 'unavailable') return 'desktop.rightPanel.assistant.diagnostic.codex.unavailable';
  return 'desktop.rightPanel.assistant.diagnostic.codex.unknown';
}

function getToolsDiagnosticKey(state: FolioleAideCapabilityDiagnostic['tools']) {
  if (state === 'failed') return 'desktop.rightPanel.assistant.diagnostic.tools.failed';
  if (state === 'running') return 'desktop.rightPanel.assistant.diagnostic.tools.running';
  if (state === 'stopped') return 'desktop.rightPanel.assistant.diagnostic.tools.stopped';
  return 'desktop.rightPanel.assistant.diagnostic.tools.unknown';
}

function getCapabilityStatusKey(
  state: FolioleAideCapabilityState,
  reason: FolioleAideCapabilityUnavailableReason | null
) {
  if (state === 'checking') return 'desktop.rightPanel.assistant.checking';
  if (state !== 'unavailable') return null;
  if (reason === 'not_configured') return 'desktop.rightPanel.assistant.unavailable.notConfigured';
  if (reason === 'agent_control_unavailable') return 'desktop.rightPanel.assistant.unavailable.agentControl';
  if (reason === 'auth_failed') return null;
  if (reason === 'overloaded' || reason === 'busy') return 'desktop.rightPanel.assistant.unavailable.busy';
  if (reason === 'interrupted') return 'desktop.rightPanel.assistant.unavailable.interrupted';
  if (reason === 'missingThreadIndex') return 'desktop.rightPanel.assistant.unavailable.missingThreadIndex';
  if (reason === 'missingSendMessage') return 'desktop.rightPanel.assistant.unavailable.missingSendMessage';
  if (reason === 'launch_failed') return 'desktop.rightPanel.assistant.unavailable.launchFailed';
  return 'desktop.rightPanel.assistant.unavailable';
}

function getCapabilityActionKey(
  state: FolioleAideCapabilityState,
  reason: FolioleAideCapabilityUnavailableReason | null
) {
  if (state === 'checking') return 'desktop.rightPanel.assistant.checkingAction';
  if (reason === 'auth_failed') return 'desktop.rightPanel.assistant.signIn';
  if (state === 'unavailable') return 'desktop.rightPanel.assistant.retry';
  if (state === 'needsCheck') return 'desktop.rightPanel.assistant.check';
  return 'desktop.rightPanel.assistant.check';
}
