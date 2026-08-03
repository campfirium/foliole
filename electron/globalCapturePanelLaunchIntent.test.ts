// @vitest-environment node
import { expect, it, vi } from 'vitest';

import {
  createGlobalCapturePanelLaunchIntent,
  createGlobalCapturePanelSingleInstanceData,
  GLOBAL_CAPTURE_PANEL_LAUNCH_ARG
} from './globalCapturePanelLaunchIntent.js';

it('opens the existing capture panel after a cold-start launch intent becomes ready', async () => {
  const showCapturePanel = vi.fn().mockResolvedValue({ type: 'cancelled' });
  const intent = createGlobalCapturePanelLaunchIntent(
    ['/opt/Foliole/foliole', GLOBAL_CAPTURE_PANEL_LAUNCH_ARG],
    showCapturePanel
  );

  expect(intent.hasInitialIntent).toBe(true);
  expect(showCapturePanel).not.toHaveBeenCalled();

  intent.markReady();
  await vi.waitFor(() => expect(showCapturePanel).toHaveBeenCalledTimes(1));
});

it('opens the existing capture panel for a second-instance launch intent', async () => {
  const showCapturePanel = vi.fn().mockResolvedValue({ type: 'cancelled' });
  const intent = createGlobalCapturePanelLaunchIntent(['/opt/Foliole/foliole'], showCapturePanel);
  intent.markReady();

  expect(intent.request(['/opt/Foliole/foliole', GLOBAL_CAPTURE_PANEL_LAUNCH_ARG])).toBe(true);
  await vi.waitFor(() => expect(showCapturePanel).toHaveBeenCalledTimes(1));
});

it('preserves the launch intent through Electron single-instance additional data', async () => {
  const showCapturePanel = vi.fn().mockResolvedValue({ type: 'cancelled' });
  const intent = createGlobalCapturePanelLaunchIntent(['/opt/Foliole/foliole'], showCapturePanel);
  intent.markReady();

  const data = createGlobalCapturePanelSingleInstanceData([
    '/opt/Foliole/foliole',
    GLOBAL_CAPTURE_PANEL_LAUNCH_ARG
  ]);
  expect(intent.request(['/opt/Foliole/foliole'], data)).toBe(true);
  await vi.waitFor(() => expect(showCapturePanel).toHaveBeenCalledTimes(1));
});

it('leaves ordinary launches on the existing main-window path', () => {
  const showCapturePanel = vi.fn().mockResolvedValue({ type: 'cancelled' });
  const intent = createGlobalCapturePanelLaunchIntent(['/opt/Foliole/foliole'], showCapturePanel);
  intent.markReady();

  expect(intent.hasInitialIntent).toBe(false);
  expect(intent.request(['/opt/Foliole/foliole'], { globalCapturePanel: false })).toBe(false);
  expect(showCapturePanel).not.toHaveBeenCalled();
});
