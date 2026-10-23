import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { isNativeCompanionRuntime } from './companionBootstrap';

type Unsubscribe = () => void;

export async function readNativeAppActiveState() {
  if (!isNativeCompanionRuntime()) {
    return true;
  }
  return (await App.getState()).isActive;
}

async function toUnsubscribe(handlePromise: Promise<{ remove: () => Promise<void> }>) {
  const handle = await handlePromise;
  return () => {
    void handle.remove();
  };
}

export async function subscribeNativeAppForeground(handler: () => void): Promise<Unsubscribe> {
  if (!isNativeCompanionRuntime()) {
    return () => undefined;
  }

  const unsubscribes = await Promise.all([
    toUnsubscribe(
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          handler();
        }
      })
    ),
    toUnsubscribe(
      App.addListener('resume', () => {
        handler();
      })
    )
  ]);

  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

export async function subscribeNativeAppBackground(handler: () => void): Promise<Unsubscribe> {
  if (!isNativeCompanionRuntime()) {
    return () => undefined;
  }

  const unsubscribes = await Promise.all([
    toUnsubscribe(
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          handler();
        }
      })
    ),
    toUnsubscribe(App.addListener('pause', handler))
  ]);

  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

/**
 * Fires only when the app actually leaves the screen. iOS reports transient
 * interruptions (Control Center, call banners) as inactive; Android reports
 * partial occlusion as pause. Neither should end work that only needs the app
 * to stay alive.
 */
export async function subscribeNativeAppEnteredBackground(handler: () => void): Promise<Unsubscribe> {
  if (!isNativeCompanionRuntime()) {
    return () => undefined;
  }
  if (Capacitor.getPlatform() === 'ios') {
    return toUnsubscribe(App.addListener('pause', handler));
  }
  return toUnsubscribe(App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      handler();
    }
  }));
}
