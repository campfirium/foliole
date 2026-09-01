import type { NativeAssistantWorkspaceContext } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListInsetPaddingClassName
} from '../../shared/ui';

import { useFolioleAideCapability } from './useFolioleAideCapability';
import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import { FolioleAideReadyContent } from './WorkspaceRightSidebarAssistantReadyContent';

export function WorkspaceRightSidebarAssistantPanel(props: {
  activeNodeId: string | null;
  editorAdapterRef?: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  nodesById: Record<string, Node>;
  onOpenModelSettings?: () => void;
  onSelectNode: (nodeId: string) => void;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
}) {
  const t = useTranslation();
  const capability = useFolioleAideCapability();
  const controller = useWorkspaceRightSidebarAssistantPanelController({
    ...props,
    aideReady: capability.ready,
    byokConfigured: capability.byokSettings?.selected_provider === 'openai-compatible'
      && capability.byokSettings.state === 'configured',
    byokModel: capability.byokSettings?.model ?? '',
    codexReady: capability.codexReady,
    failedText: t('desktop.rightPanel.assistant.failed'),
    outcomeUncertainText: t('desktop.rightPanel.assistant.outcomeUncertain'),
    onCapabilityFailure: capability.markUnavailableFromFailure,
    onSelectProvider: capability.selectProvider,
    selectedProvider: capability.byokSettings?.selected_provider ?? 'codex-app-server',
    topicUnavailableText: t('desktop.rightPanel.assistant.location.topicUnavailable')
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!capability.ready ? (
        <FolioleAideCapabilityGate
          onOpenModelSettings={props.onOpenModelSettings ?? (() => undefined)}
          checking={capability.state === 'checking'}
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
  checking: boolean;
  onOpenModelSettings: () => void;
}) {
  const t = useTranslation();
  return (
    <section className={`${inspectorListInsetPaddingClassName} flex flex-1 items-center justify-center py-10`}>
      <div className="mx-auto flex max-w-[13.5rem] -translate-y-[4vh] flex-col items-center text-center">
        <h2 className="m-0 text-xl font-semibold text-foreground/62">
          {t('desktop.rightPanel.assistant.title')}
        </h2>
        <p className="m-0 mt-3 text-ui-sm leading-5 text-foreground/50">
          {t('desktop.rightPanel.assistant.emptyDescription')}
        </p>
        <AppButton
          className="mt-4 px-4"
          disabled={props.checking}
          onClick={props.onOpenModelSettings}
          size="sm"
          type="button"
        >
          {t('desktop.rightPanel.assistant.openModelSettings')}
        </AppButton>
      </div>
    </section>
  );
}
