// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DESKTOP_REGRESSION_SUITE,
  formatDesktopRegressionSuite,
  validateDesktopRegressionSuite
} from './desktop-regression-suite.mjs';
import { HIDDEN_MODE_HEALTH_SPECS } from '../windows/playwright-desktop-native-hidden.mjs';

const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const RELEASE_SPEC_PLACEHOLDER = '(release workflow / package verification)';

function npmScripts(command) {
  return [...command.matchAll(/npm run ([^\s&]+)/gu)].map((match) => match[1]);
}

describe('desktop regression suite manifest', () => {
  it('classifies every candidate with triggers, limits, and an explicit command', () => {
    expect(validateDesktopRegressionSuite()).toBe(true);
    expect(DESKTOP_REGRESSION_SUITE.map((entry) => entry.id)).toEqual([
      'startup-settings-backups',
      'main-path-smoke',
      'pdf-user-journey',
      'pdf-appearance-mode-switch',
      'text-anchor-navigation',
      'global-capture-panel',
      'global-capture-toast-navigation',
      'installed-app-smoke'
    ]);
  });

  it('keeps admission status separate from runtime classification', () => {
    expect(DESKTOP_REGRESSION_SUITE.every((entry) => entry.admission)).toBe(true);
    expect(
      DESKTOP_REGRESSION_SUITE
        .filter((entry) => entry.admission === 'enabled')
        .map((entry) => entry.id)
    ).toEqual(['startup-settings-backups']);
    expect(
      DESKTOP_REGRESSION_SUITE
        .filter((entry) => entry.classification === 'release-only')
        .every((entry) => entry.admission === 'release-only')
    ).toBe(true);
  });

  it('keeps visible and release-only candidates out of hidden commands', () => {
    const nonHidden = DESKTOP_REGRESSION_SUITE.filter((entry) =>
      ['visible-required', 'release-only'].includes(entry.classification)
    );

    expect(nonHidden.every((entry) => !entry.command.includes('native:hidden'))).toBe(true);
  });

  it('points every runnable candidate at existing specs and npm scripts', () => {
    for (const entry of DESKTOP_REGRESSION_SUITE) {
      if (entry.spec !== RELEASE_SPEC_PLACEHOLDER) {
        expect(fs.existsSync(path.resolve(entry.spec)), entry.spec).toBe(true);
      }
      for (const script of npmScripts(entry.command)) {
        expect(PACKAGE_JSON.scripts[script], `${entry.id} -> ${script}`).toBeTruthy();
      }
    }
  });

  it('keeps classification and command mode aligned', () => {
    for (const entry of DESKTOP_REGRESSION_SUITE) {
      if (['hidden-capable', 'hidden-screening-required'].includes(entry.classification)) {
        expect(entry.command).toContain('native:hidden');
      }
      if (entry.classification === 'visible-required') {
        expect(entry.command).toContain('native:visible');
      }
      if (entry.classification === 'release-only') {
        expect(entry.command).not.toContain('native:hidden');
        expect(entry.command).not.toContain('native:visible');
      }
    }
  });

  it('keeps hidden automation consumption limited to screened hidden-capable specs', () => {
    const cleared = DESKTOP_REGRESSION_SUITE.filter((entry) => entry.hiddenAutomationCleared);

    expect(cleared.map((entry) => entry.classification)).toEqual(['hidden-capable']);
    expect(
      DESKTOP_REGRESSION_SUITE
        .filter((entry) => entry.classification === 'hidden-screening-required')
        .every((entry) => entry.hiddenAutomationCleared === false)
    ).toBe(true);
  });

  it('does not make regression specs part of the no-arg hidden mode health default', () => {
    const regressionSpecs = new Set(DESKTOP_REGRESSION_SUITE.map((entry) => entry.spec));

    expect(HIDDEN_MODE_HEALTH_SPECS).toContain('tests/desktop/hidden-native-presentation.spec.ts');
    expect(HIDDEN_MODE_HEALTH_SPECS.some((spec) => regressionSpecs.has(spec))).toBe(false);
  });

  it('formats a markdown table for T0/T5 consumers', () => {
    const output = formatDesktopRegressionSuite();

    expect(output).toContain('startup-settings-backups');
    expect(output).toContain('hidden-capable');
    expect(output).toContain('enabled');
    expect(output).toContain('manifest-only; run explicitly before release use');
    expect(output).toContain('T0, T5');
  });
});
