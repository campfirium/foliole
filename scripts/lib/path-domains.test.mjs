// @vitest-environment node

import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  inferPreviewTargetsFromFiles,
  isAndroidContractPath,
  isAndroidSyncBoundaryPath,
  isSyncPackPath,
  pathMatchesLintScope,
  resolveStaticQualityRoute
} from './path-domains.mjs';

function runPathDomains(input) {
  return new Promise((resolve, reject) => {
    const scriptPath = fileURLToPath(new URL('./path-domains.mjs', import.meta.url));
    const child = spawn(process.execPath, [scriptPath, 'quality-route'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.stdin.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
    child.stdin.end(input);
  });
}

describe('path-domains', () => {
  it('reads route input larger than the pipe buffer without EAGAIN', async () => {
    const input = Array.from({ length: 5_000 }, (_, index) => `scripts/generated-${index}.mjs`).join('\n');

    await expect(runPathDomains(input)).resolves.toEqual({
      code: 0,
      stderr: '',
      stdout: 'mid\tnon-Android script changed\n'
    });
  });

  it('maps shared store paths differently per consumer without duplicating path facts', () => {
    expect(resolveStaticQualityRoute(['src/store/workspaceStore.ts'])).toEqual({
      level: 'shared',
      reason: 'shared runtime or store changed'
    });
    expect(inferPreviewTargetsFromFiles(['src/store/workspaceStore.ts'])).toEqual(['windows']);
    expect(pathMatchesLintScope('shared', 'src/store/workspaceStore.ts')).toBe(true);
    expect(pathMatchesLintScope('desktop', 'src/store/workspaceStore.ts')).toBe(false);
  });

  it('covers host and shared preview target mappings', () => {
    expect(inferPreviewTargetsFromFiles(['electron/main.ts'])).toEqual(['windows']);
    expect(inferPreviewTargetsFromFiles(['android/app/build.gradle'])).toEqual(['android']);
    expect(inferPreviewTargetsFromFiles(['package.json'])).toEqual(['android', 'windows']);
    expect(inferPreviewTargetsFromFiles(['lib/core/sync/syncPackManifest.ts'])).toEqual(['android', 'windows']);
  });

  it('keeps quality route path decisions separate from dynamic source checks', () => {
    expect(resolveStaticQualityRoute(['src/shared/ui/Button.tsx'])).toEqual({
      level: 'mid',
      reason: 'shared UI surface changed'
    });
    expect(resolveStaticQualityRoute(['src/features/cards/Card.tsx'])).toBeNull();
    expect(resolveStaticQualityRoute(['scripts/android/generate.mjs'])).toEqual({
      level: 'android',
      reason: 'android or companion path changed'
    });
    expect(resolveStaticQualityRoute(['lib/core/database/androidCompanionDiagnosticReadRules.ts'])).toEqual({
      level: 'android',
      reason: 'Android contract changed'
    });
    expect(resolveStaticQualityRoute([
      'lib/core/database/androidCompanionSyncPolicySql.ts',
      'src/store/workspaceStore.ts'
    ])).toEqual({
      level: 'full',
      reason: 'Android contract changed with another production domain'
    });
  });

  it('matches lint scopes using the shared path rules', () => {
    expect(pathMatchesLintScope('desktop', 'src/shared/platform/runtime.ts')).toBe(true);
    expect(pathMatchesLintScope('android', 'src/shared/commands/open.ts')).toBe(true);
    expect(pathMatchesLintScope('shared', 'scripts/quality/quality-gate-fast.test.mjs')).toBe(true);
    expect(pathMatchesLintScope('android', 'src/app/App.tsx')).toBe(false);
  });

  it('exposes pre-push specialty checks without broadening them', () => {
    expect(isSyncPackPath('electron/database/syncPackBuilder.ts')).toBe(true);
    expect(isSyncPackPath('electron/database/other.ts')).toBe(false);
    expect(isAndroidSyncBoundaryPath('android/app/src/main/assets/companion-schema.json')).toBe(true);
    expect(isAndroidContractPath('lib/core/database/androidCompanionBridgeContractDefinitions.ts')).toBe(true);
    expect(isAndroidSyncBoundaryPath('lib/core/database/androidCompanionDerivedReadSql.ts')).toBe(true);
    expect(isAndroidSyncBoundaryPath('android/app/src/main/java/com/foliole/android/Other.java')).toBe(false);
  });
});
