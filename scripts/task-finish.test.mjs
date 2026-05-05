/* global process */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  collectPreviewDiagnostics,
  extractPreviewStatus,
  inferPreviewTargetsFromFiles,
  resolveChangedFiles,
  resolvePreviewTargets,
  runTaskFinish
} from './task-finish.mjs';

describe('task-finish helpers', () => {
  it('extracts the final preview status from script output', () => {
    expect(
      extractPreviewStatus(
        [
          '[windows-preview] step 1/3: verify electron-dist freshness',
          '[windows-preview] status: SYNCED',
          '[windows-preview] status: STARTED'
        ].join('\n'),
        'windows'
      )
    ).toBe('STARTED');
  });

  it('resolves changed files from git status output', () => {
    expect(resolveChangedFiles(' M package.json\n?? android/\nR  old.ts -> src/companion/main.tsx\n')).toEqual([
      'package.json',
      'android/',
      'src/companion/main.tsx'
    ]);
  });

  it('infers preview targets from changed files', () => {
    expect(inferPreviewTargetsFromFiles(['android/app/build.gradle'])).toEqual(['android']);
    expect(inferPreviewTargetsFromFiles(['electron/main.ts'])).toEqual(['windows']);
    expect(inferPreviewTargetsFromFiles(['package.json'])).toEqual(['android', 'windows']);
  });

  it('prefers explicit preview target override when provided', () => {
    expect(resolvePreviewTargets({ changedFiles: ['electron/main.ts'], requestedTarget: 'android' })).toEqual(['android']);
    expect(resolvePreviewTargets({ changedFiles: ['android/app/build.gradle'], requestedTarget: 'both' })).toEqual([
      'android',
      'windows'
    ]);
  });

  it('runs windows preview when desktop files changed', async () => {
    const runWindowsPreview = vi.fn().mockResolvedValue({
      code: 0,
      stderr: '',
      stdout: '[windows-preview] status: STARTED\n'
    });

    const result = await runTaskFinish({
      changedFiles: ['electron/main.ts'],
      collectDiagnostics: vi.fn(),
      runWindowsPreview
    });

    expect(runWindowsPreview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      previewStatus: 'STARTED',
      previewTarget: 'windows',
      previewTargets: ['windows'],
      status: 'EXECUTED'
    });
  });

  it('runs android preview when android files changed', async () => {
    const runAndroidPreview = vi.fn().mockResolvedValue({
      code: 0,
      stderr: '',
      stdout: '[android-preview] status: OPENED\n'
    });

    const result = await runTaskFinish({
      changedFiles: ['android/app/build.gradle'],
      collectDiagnostics: vi.fn(),
      runAndroidPreview
    });

    expect(runAndroidPreview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      previewStatus: 'OPENED',
      previewTarget: 'android',
      previewTargets: ['android'],
      status: 'EXECUTED'
    });
  });

  it('retries preview when the first run only requests restart', async () => {
    const runWindowsPreview = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stderr: '',
        stdout: '[windows-preview] status: RESTART_REQUESTED\n'
      })
      .mockResolvedValueOnce({
        code: 0,
        stderr: '',
        stdout: '[windows-preview] status: SYNCED\n'
      });

    const result = await runTaskFinish({
      changedFiles: ['electron/main.ts'],
      collectDiagnostics: vi.fn(),
      runWindowsPreview
    });

    expect(runWindowsPreview).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      attemptCount: 2,
      executed: true,
      exitCode: 0,
      previewStatus: 'SYNCED',
      status: 'EXECUTED'
    });
  });

  it('returns failure with diagnostics when preview never reaches a stable success state', async () => {
    const runWindowsPreview = vi.fn().mockResolvedValue({
      code: 0,
      stderr: '',
      stdout: '[windows-preview] status: RESTART_REQUESTED\n'
    });
    const collectDiagnosticsMock = vi.fn().mockResolvedValue({
      latestBootEvent: { stage: 'app_ready_timeout' },
      latestRendererState: { label: 'did-finish-load', snapshot: { readyState: 'interactive', rootPresent: true } }
    });

    const result = await runTaskFinish({
      changedFiles: ['electron/main.ts'],
      collectDiagnostics: collectDiagnosticsMock,
      runWindowsPreview
    });

    expect(runWindowsPreview).toHaveBeenCalledTimes(2);
    expect(collectDiagnosticsMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      attemptCount: 2,
      diagnostics: {
        latestBootEvent: { stage: 'app_ready_timeout' }
      },
      executed: true,
      exitCode: 1,
      previewStatus: 'RESTART_REQUESTED',
      status: 'FAILED'
    });
  });

  it('returns failure when preview fails', async () => {
    const runWindowsPreview = vi.fn().mockResolvedValue({
      code: 1,
      stderr: 'preview failed',
      stdout: ''
    });
    const collectDiagnosticsMock = vi.fn().mockResolvedValue({ latestBootEvent: { stage: 'missing' } });

    const result = await runTaskFinish({
      changedFiles: ['electron/main.ts'],
      collectDiagnostics: collectDiagnosticsMock,
      runWindowsPreview
    });

    expect(result).toMatchObject({
      attemptCount: 1,
      diagnostics: {
        latestBootEvent: { stage: 'missing' }
      },
      executed: true,
      exitCode: 1,
      previewStatus: null,
      status: 'FAILED'
    });
  });

  it('collects preview diagnostics from boot and renderer logs', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-preview-diagnostics-'));

    await fs.mkdir(path.join(repoRoot, 'logs', 'windows'), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, '.windows-native-boot-ready.json'),
      JSON.stringify({ stage: 'app_ready' }),
      'utf8'
    );
    await fs.writeFile(
      path.join(repoRoot, '.windows-native-bridge-ready.json'),
      JSON.stringify({ stage: 'bridge_ready' }),
      'utf8'
    );
    await fs.writeFile(
      path.join(repoRoot, 'logs', 'windows', 'native-boot-events.ndjson'),
      `${JSON.stringify({ stage: 'mount_complete' })}\n${JSON.stringify({ stage: 'app_ready_timeout' })}\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(repoRoot, 'logs', 'windows', 'renderer-state.ndjson'),
      `${JSON.stringify({ label: 'did-finish-load', snapshot: { href: 'http://localhost:5173', readyState: 'interactive', rootPresent: true } })}\n`,
      'utf8'
    );

    const diagnostics = await collectPreviewDiagnostics({ cwd: repoRoot });

    expect(diagnostics).toMatchObject({
      bootReadyMarker: { stage: 'app_ready' },
      bridgeReadyMarker: { stage: 'bridge_ready' },
      latestBootEvent: { stage: 'app_ready_timeout' },
      latestRendererState: {
        label: 'did-finish-load',
        snapshot: {
          href: 'http://localhost:5173',
          readyState: 'interactive',
          rootPresent: true
        }
      }
    });
  });

  it('prefers Windows mirror diagnostics when current run logs are not in the repo root', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-preview-diagnostics-repo-'));
    const windowsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-preview-diagnostics-win-'));

    await fs.mkdir(path.join(repoRoot, 'logs', 'windows'), { recursive: true });
    await fs.mkdir(path.join(windowsRoot, 'logs', 'windows'), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, 'logs', 'windows', 'native-boot-events.ndjson'),
      `${JSON.stringify({ stage: 'stale_repo_event' })}\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(windowsRoot, '.windows-native-boot-ready.json'),
      JSON.stringify({ stage: 'app_ready' }),
      'utf8'
    );
    await fs.writeFile(
      path.join(windowsRoot, 'logs', 'windows', 'native-boot-events.ndjson'),
      `${JSON.stringify({ stage: 'current_windows_event' })}\n`,
      'utf8'
    );

    const diagnostics = await collectPreviewDiagnostics({
      cwd: repoRoot,
      env: { ...process.env, WINDOWS_RESTART_INTENT_ROOT: windowsRoot }
    });

    expect(diagnostics).toMatchObject({
      bootReadyMarker: { stage: 'app_ready' },
      latestBootEvent: { stage: 'current_windows_event' },
      stateRoot: windowsRoot
    });
  });
});
