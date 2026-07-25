import { registerPlugin } from '@capacitor/core';

import { isAvailableNativeAndroidCompanionRuntime } from './companionWorkspaceRuntimeRepository';

export interface CompanionNodeTextAlternative {
  alternative_id: string;
  body_text: string;
  created_at: string;
  node_id: string;
  source_device_id: string;
  source_version_id: string;
  status: 'available' | 'dismissed' | 'promoted' | 'superseded';
  updated_at: string;
}

interface CompanionAlternativePlugin {
  load(args: { node_id: string }): Promise<{ alternative: CompanionNodeTextAlternative | null }>;
  updateStatus(args: {
    alternative_id: string;
    status: 'dismissed' | 'promoted';
    updated_at: string;
  }): Promise<{ alternative: CompanionNodeTextAlternative }>;
}

const AlternativePlugin = registerPlugin<CompanionAlternativePlugin>('FolioleCompanionAlternative');

export async function loadCompanionNodeTextAlternative(nodeId: string) {
  if (!isAvailableNativeAndroidCompanionRuntime()) return null;
  const result = await AlternativePlugin.load({ node_id: nodeId });
  return result.alternative;
}

export async function updateCompanionNodeTextAlternativeStatus(
  alternativeId: string,
  status: 'dismissed' | 'promoted'
): Promise<CompanionNodeTextAlternative> {
  const result = await AlternativePlugin.updateStatus({
    alternative_id: alternativeId,
    status,
    updated_at: new Date().toISOString()
  });
  return result.alternative;
}
