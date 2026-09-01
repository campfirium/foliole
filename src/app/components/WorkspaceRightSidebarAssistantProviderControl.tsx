import type { NativeAssistantProviderId } from '../../../lib/platform/nativeAssistantContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appSurfaceControlClassName } from '../../shared/ui';

import type { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantModelControl } from './WorkspaceRightSidebarAssistantModelControl';

export function WorkspaceRightSidebarAssistantProviderControl(props: {
  byokConfigured: boolean;
  byokModel: string;
  codexReady: boolean;
  onSelect: (provider: NativeAssistantProviderId) => Promise<void>;
  provider: NativeAssistantProviderId;
  threadBound: boolean;
}) {
  const t = useTranslation();
  const byokLabel = t('desktop.rightPanel.assistant.provider.byok', {
    model: props.byokModel || t('desktop.rightPanel.assistant.provider.unconfiguredModel')
  });
  if (props.threadBound) {
    return (
      <span className="max-w-32 truncate text-ui-xs text-foreground/55" title={providerLabel()}>
        {providerLabel()}
      </span>
    );
  }
  return (
    <select
      aria-label={t('desktop.rightPanel.assistant.provider.label')}
      className={appSurfaceControlClassName('h-7 max-w-36 py-0 text-ui-xs')}
      onChange={(event) => void props.onSelect(event.target.value as NativeAssistantProviderId)}
      value={props.provider}
    >
      <option disabled={!props.codexReady} value="codex-app-server">Codex</option>
      <option disabled={!props.byokConfigured} value="openai-compatible">{byokLabel}</option>
    </select>
  );

  function providerLabel() {
    return props.provider === 'openai-compatible' ? byokLabel : 'Codex';
  }
}

export function AssistantProviderAndModelControls(props: {
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
}) {
  const controls = props.controller.providerControls;
  return (
    <>
      <WorkspaceRightSidebarAssistantProviderControl {...controls} />
      {controls.provider === 'codex-app-server'
        ? <WorkspaceRightSidebarAssistantModelControl controls={props.controller.modelControls} />
        : null}
    </>
  );
}
