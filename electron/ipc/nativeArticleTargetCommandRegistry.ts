import { NATIVE_ARTICLE_TARGET_COMMANDS as NATIVE_COMMANDS } from '../../lib/platform/articleTarget.js';

export const NATIVE_ARTICLE_TARGET_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.loadArticleTargets, route: 'windowAndUtility', capability: 'read' },
  { command: NATIVE_COMMANDS.selectArticleTarget, route: 'windowAndUtility', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.sendArticleToEdge, route: 'windowAndUtility', capability: 'filesystemWrite' },
  { command: NATIVE_COMMANDS.openLocalPath, route: 'windowAndUtility', capability: 'filesystemOpen' },
] as const;
