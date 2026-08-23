import path from 'node:path';

import { checkedPairSyncCommand } from '../sync-group/pair-sync-command.mjs';
import { pairSyncRecoveryFailure } from '../sync-group/pair-sync-feature-contract.mjs';
import { runA5PairSyncFeatureJourney } from '../sync-group/pair-sync-feature-journey.mjs';
import { captureWindowsA5Screenshot } from './windows-a5-screenshot.mjs';
import {
  openPairSyncDesktopSession, waitForUniquePairRequest
} from './windows-pair-sync-desktop-session.mjs';
import {
  inspectAuthorizedDesktopPreflight, validateOwnedDesktopPreflight
} from './windows-pair-sync-desktop-readiness.mjs';

function options(env) {
  return { env, timeoutCode: 'desktop_client_timeout', timeoutMs: 2 * 60_000,
    windowsHide: true };
}

async function clientControl(execute, paths, env, action) {
  const script = path.join(paths.repoRoot, 'scripts', 'windows', 'windows-client-native.mjs');
  return checkedPairSyncCommand(execute, paths.systemNode, [script, action], options(env),
    `desktop-client-${action}`);
}

async function desktopStep(stage, action) {
  try { return await action(); }
  catch (error) {
    if (error?.stage) throw error;
    throw pairSyncRecoveryFailure(error.message, stage, error);
  }
}

export async function inspectWindowsPairSyncRecoveryDesktop({
  desktopAuthorizationFingerprint, env, execute, existingPairing = false,
  hostName, openDesktopSession = openPairSyncDesktopSession, paths
}) {
  const output = [];
  await clientControl(execute, paths, env, 'stop');
  let session; let primaryError; let overview;
  try {
    session = await desktopStep('desktop-session-open', () =>
      openDesktopSession({ env, repoRoot: paths.repoRoot }));
    overview = await inspectAuthorizedDesktopPreflight(
      await desktopStep('desktop-pairing-load', () => session.load()),
      session, hostName, desktopAuthorizationFingerprint, existingPairing
    );
  } catch (error) { primaryError = error; }
  try { await session?.close(); }
  catch (error) {
    primaryError ??= pairSyncRecoveryFailure(error.message, 'desktop-session-close', error);
  }
  try { output.push((await clientControl(execute, paths, env, 'start')).output); }
  catch (error) { primaryError ??= error; }
  if (primaryError) throw primaryError;
  return { output: output.join(''), overview };
}

export function runWindowsA5PairSyncRecovery(options) {
  return runA5PairSyncFeatureJourney({
    ...options, captureScreenshot: options.captureScreenshot ?? captureWindowsA5Screenshot,
    desktopControl: options.desktopControl ?? clientControl,
    openDesktopSession: options.openDesktopSession ?? openPairSyncDesktopSession,
    validateDesktop: options.validateDesktop ?? validateOwnedDesktopPreflight,
    waitForPairRequest: options.waitForPairRequest ?? waitForUniquePairRequest
  });
}
