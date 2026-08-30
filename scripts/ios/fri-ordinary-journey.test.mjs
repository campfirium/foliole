// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildFriOrdinaryJourneyCommands,
  FRI_ORDINARY_APP_ID,
  FRI_ORDINARY_BUNDLE_SUFFIX,
  FRI_ORDINARY_TEST,
  FRI_XCUITEST_RUNNER
} from './fri-ordinary-journey.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Fri ordinary journey', () => {
  it('builds and runs the current workspace without preparing source', () => {
    const commands = buildFriOrdinaryJourneyCommands({
      evidenceRoot: '/evidence', repoRoot: '/repo'
    });

    expect(commands.map(({ command, stage }) => [command, stage])).toEqual([
      ['npm', 'companion-build'], ['npx', 'capacitor-ios-sync'], ['bash', 'fri-ordinary-xcuitest']
    ]);
    expect(commands[0].args).toEqual(['run', 'android:web:build']);
    expect(commands[1].args).toEqual(['cap', 'sync', 'ios']);
    expect(commands[2].args).toEqual([
      FRI_XCUITEST_RUNNER,
      '--project', '/repo/ios/App/App.xcodeproj',
      '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', '/evidence/xcuitest',
      '--only-testing', FRI_ORDINARY_TEST
    ]);
    expect(commands[2].args).not.toContain('--allow-wireless');
    expect(commands[2].env.FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)
      .toBe(FRI_ORDINARY_BUNDLE_SUFFIX);
  });

  it('isolates and exactly removes only the fixed ordinary acceptance app', () => {
    const source = read('scripts/ios/fri-ordinary-journey.mjs');

    expect(FRI_ORDINARY_APP_ID).toBe('com.foliole.ios.ordinaryjourney');
    expect(source).toContain("'--bundle-id', FRI_ORDINARY_APP_ID");
    expect(source).toContain("'uninstall', 'app'");
    expect(source).toContain('removeAcceptanceApp(evidenceRoot, repoRoot)');
    expect(source).not.toContain("execute('git'");
    expect(source).not.toMatch(/fetch|pull|reset|receipt|candidate/iu);
  });

  it('registers the dedicated product journey test only in the physical UI target', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const sourceName = 'FoliolePhysicalOrdinaryJourneyUITests.swift in Sources';
    const appSources = project.match(/504EC3001FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0];
    const physicalSources = project.match(/50F100051FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0];

    expect(appSources).not.toContain(sourceName);
    expect(physicalSources).toContain(sourceName);
    expect(read('ios/App/AppPhysicalUITests/FoliolePhysicalOrdinaryJourneyUITests.swift'))
      .toContain('Fri-ordinary-after-relaunch');
  });
});
