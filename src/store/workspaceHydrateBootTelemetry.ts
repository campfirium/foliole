import { reportRuntimeBootStage } from '../shared/platform/runtimeBootTelemetry';

interface WorkspaceHydrateBootPayload {
  [key: string]: unknown;
}

export function reportWorkspaceHydrateBootStage(stage: string, payload?: WorkspaceHydrateBootPayload) {
  reportRuntimeBootStage(`workspace_hydrate_${stage}`, payload);
}
