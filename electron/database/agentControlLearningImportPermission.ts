import { AGENT_CONTROL_LEARNING_IMPORT_KEY } from '../../lib/platform/agentControlLearningImport.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

export function isAgentControlLearningImportEnabled() {
  return loadJsonSetting(AGENT_CONTROL_LEARNING_IMPORT_KEY) === true;
}

export function saveAgentControlLearningImportPermission(value: unknown) {
  if (value !== 'true' && value !== 'false') throw new Error('invalid learning import permission');
  saveJsonSetting(AGENT_CONTROL_LEARNING_IMPORT_KEY, value === 'true');
}
