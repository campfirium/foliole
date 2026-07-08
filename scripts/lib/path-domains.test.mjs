// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  inferPreviewTargetsFromFiles,
  isAndroidSyncBoundaryPath,
  isSyncPackPath,
  pathMatchesLintScope,
  resolveStaticQualityRoute
} from './path-domains.mjs';

describe('path-domains', () => {
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
    expect(isAndroidSyncBoundaryPath('android/app/src/main/java/com/foliole/android/Other.java')).toBe(false);
  });
});
