import { Capacitor } from '@capacitor/core';

import { getStoredAppLocale } from '../../../localization/appLanguage';
import { translate } from '../../../localization/translations';
import { readNativeAppActiveState, subscribeNativeAppEnteredBackground } from '../../appLifecycle.js';
import { isNativeCompanionRuntime } from '../../companionBootstrap.js';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository.js';

export type CompanionSyncBackgroundWork = { report(completed: number, total: number): void; release(): void };

let holds = 0;
// A system end drops every hold at once; releases from before it must not touch later holds.
let generation = 0;
let nativeListening = false;
const endedListeners = new Set<() => void>();
const idle: CompanionSyncBackgroundWork = { report: () => undefined, release: () => undefined };

// Host calls are best effort: a missing or failing method must never fail the sync round.
const call = (run: () => Promise<unknown>, failed: () => void = () => undefined) =>
  void Promise.resolve().then(run).catch(failed);

const copy = (key: 'companion.syncBackground.title' | 'companion.syncBackground.preparing'
  | 'companion.syncBackground.channel', params?: Record<string, number>) => translate(getStoredAppLocale(), key, params);

function ended() {
  if (holds === 0) return;
  holds = 0;
  generation += 1;
  endedListeners.forEach(listener => listener());
}

function listenForNativeEnd() {
  if (nativeListening) return;
  nativeListening = true;
  call(() => FolioleCompanionSync.addListener('syncBackgroundWorkEnded', ended));
}

/** True while a long round may keep running off screen. */
export function isCompanionSyncBackgroundWorkHeld() {
  return holds > 0;
}

/** Fires when held background work stops: released, refused, or ended by the system. */
export function subscribeCompanionSyncBackgroundWorkEnded(listener: () => void) {
  endedListeners.add(listener);
  return () => { endedListeners.delete(listener); };
}

/**
 * Asks the host to keep a long round running if the app leaves the screen, showing progress
 * in a system notification. Android only; must start while the app is still visible.
 */
export function holdCompanionSyncBackgroundWork(): CompanionSyncBackgroundWork {
  if (!isNativeCompanionRuntime() || Capacitor.getPlatform() !== 'android') return idle;
  listenForNativeEnd();
  holds += 1;
  if (holds === 1) {
    call(() => FolioleCompanionSync.beginSyncBackgroundWork({ title: copy('companion.syncBackground.title'),
      text: copy('companion.syncBackground.preparing'), channel_name: copy('companion.syncBackground.channel') }), ended);
  }
  const owner = generation;
  let released = false;
  const current = () => !released && owner === generation;
  return {
    report(completed, total) {
      if (!current()) return;
      call(() => FolioleCompanionSync.updateSyncBackgroundWork({ title: copy('companion.syncBackground.title'),
        text: translate(getStoredAppLocale(), 'companion.syncBackground.progress', { completed, total }),
        completed, total }));
    },
    release() {
      if (!current()) return;
      released = true;
      holds -= 1;
      if (holds > 0) return;
      generation += 1;
      call(() => FolioleCompanionSync.endSyncBackgroundWork());
      endedListeners.forEach(listener => listener());
    }
  };
}

/**
 * Runs the handler when the app leaves the screen, unless held background work keeps rounds
 * running; then it runs once that work ends while the app is still away.
 */
export async function subscribeCompanionSyncLeftScreen(handler: () => void) {
  const offEnded = subscribeCompanionSyncBackgroundWorkEnded(() => {
    void readNativeAppActiveState().then(active => { if (!active) handler(); });
  });
  const offBackground = await subscribeNativeAppEnteredBackground(() => {
    if (holds === 0) handler();
  });
  return () => { offEnded(); offBackground(); };
}
