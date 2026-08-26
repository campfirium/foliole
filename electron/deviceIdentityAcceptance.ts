import type { App } from 'electron';

import { loadDesktopDeviceIdentity } from './deviceAnchorStore.js';

const ACCEPTANCE_MARKER = 'FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE';

export function resolveDesktopDeviceIdentityAcceptance(env: NodeJS.ProcessEnv = process.env) {
  const channel = env[ACCEPTANCE_MARKER]?.trim();
  if (!channel) return null;
  if (!['development', 'github', 'mas'].includes(channel)) {
    throw new Error('device_identity_acceptance_channel_invalid');
  }
  const groupId = env.FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE_GROUP_ID?.trim();
  const libraryPath = env.FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE_LIBRARY_PATH?.trim();
  if (!groupId || !libraryPath) throw new Error('device_identity_acceptance_input_missing');
  return { channel, groupId, libraryPath };
}

export async function runDesktopDeviceIdentityAcceptance(
  app: Pick<App, 'exit'>,
  input: NonNullable<ReturnType<typeof resolveDesktopDeviceIdentityAcceptance>>
) {
  try {
    const result = await loadDesktopDeviceIdentity({
      groupId: input.groupId,
      libraryPath: input.libraryPath
    });
    console.info(`${ACCEPTANCE_MARKER} ${JSON.stringify({
      anchor_file: result.anchor_file,
      channel: input.channel,
      identity: result.identity,
      status: 'passed'
    })}`);
    app.exit(0);
  } catch (error) {
    console.error(`${ACCEPTANCE_MARKER} ${JSON.stringify({
      channel: input.channel,
      error: error instanceof Error ? error.message : String(error),
      status: 'failed'
    })}`);
    app.exit(1);
  }
}
