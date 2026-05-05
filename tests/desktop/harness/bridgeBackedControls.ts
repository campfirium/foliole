import { expect, type Locator, type Page } from '@playwright/test';

import { explainBridgeBackedControlBlockedReason } from '../../../scripts/windows/playwright-desktop-control-blocked-reason.mjs';
import type { DesktopSession } from './fixtures';

const CONTROL_ENABLE_TIMEOUT_MS = 2_000;
const CONTROL_ENABLE_POLL_MS = 100;

interface DesktopFailureDiagnostics {
  bridgeBreakpoint?: {
    kind?: string | null;
    mainProcessPid?: number | null;
    readyMarkerPid?: number | null;
  } | null;
  currentRuntime?: {
    appReady?: boolean | null;
    bridgeAvailable?: boolean | null;
    bridgeReady?: boolean | null;
    navigationReady?: boolean | null;
    pid?: number | null;
    preloadPath?: string | null;
    rendererUrl?: string | null;
  } | null;
  rendererPage?: {
    readyState?: string | null;
    rootPresent?: boolean | null;
    url?: string | null;
  } | null;
}

async function waitForControlEnabled(windowPage: Page, locator: Locator) {
  const deadline = Date.now() + CONTROL_ENABLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) {
      return true;
    }
    await windowPage.waitForTimeout(CONTROL_ENABLE_POLL_MS);
  }
  return locator.isEnabled();
}

export async function expectBridgeBackedControlEnabled(options: {
  controlName: string;
  desktopSession: DesktopSession;
  locator: Locator;
  windowPage: Page;
}) {
  const { controlName, desktopSession, locator, windowPage } = options;
  await expect(locator).toBeVisible();
  if (await waitForControlEnabled(windowPage, locator)) {
    return;
  }

  const diagnostics = (await desktopSession.collectDiagnostics()) as DesktopFailureDiagnostics;
  const blockedReason = explainBridgeBackedControlBlockedReason(diagnostics);
  throw new Error(`[desktop-smoke] ${controlName} is disabled; blocked reason: ${blockedReason}`);
}
