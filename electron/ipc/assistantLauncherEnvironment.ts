import path from 'node:path';

import {
  resolveAssistantAgentControlCommandPath,
  resolveAssistantAgentDescriptorPath
} from './assistantAgentControlContext.js';

export function resolveAssistantLauncherEnv(
  env: NodeJS.ProcessEnv,
  appRoot = process.cwd()
) {
  const userProfile = env.USERPROFILE?.trim();
  const commandPath = resolveAssistantAgentControlCommandPath(env, appRoot);
  const next: NodeJS.ProcessEnv = {
    ...env,
    FOLIOLE_AGENT_DESCRIPTOR: resolveAssistantAgentDescriptorPath(env)
  };
  prependCommandDirectory(next, path.dirname(commandPath));
  if (!next.CODEX_HOME?.trim() && userProfile) {
    next.CODEX_HOME = path.join(userProfile, '.codex');
  }
  return next;
}

function prependCommandDirectory(env: NodeJS.ProcessEnv, directory: string) {
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const current = env[key]?.trim();
  env[key] = current ? `${directory}${path.delimiter}${current}` : directory;
}
