/* global console, process */

import { fileURLToPath } from 'node:url';

export const DESKTOP_REGRESSION_CLASSIFICATIONS = new Set([
  'hidden-capable',
  'hidden-screening-required',
  'visible-required',
  'release-only'
]);

export const DESKTOP_REGRESSION_ADMISSION_STATUSES = new Set([
  'candidate',
  'enabled',
  'quarantined',
  'release-only'
]);

export const DESKTOP_REGRESSION_SUITE = [
  {
    id: 'startup-settings-backups',
    spec: 'tests/desktop/startup-settings-backups.smoke.spec.ts',
    classification: 'hidden-capable',
    triggers: ['T0', 'T4', 'T5'],
    command: 'npm run test:e2e:desktop:native:hidden -- tests/desktop/startup-settings-backups.smoke.spec.ts',
    admission: 'enabled',
    hiddenAutomationCleared: true,
    lastVerified: 'manifest-only; run explicitly before release use',
    limits: 'Covers startup shell and backup settings with isolated sqlite; not a task default.'
  },
  {
    id: 'main-path-smoke',
    spec: 'tests/desktop/main-path-smoke.spec.ts',
    classification: 'hidden-screening-required',
    triggers: ['T4', 'T5'],
    command: 'npm run test:e2e:desktop:native:hidden -- tests/desktop/main-path-smoke.spec.ts',
    admission: 'candidate',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; hidden screening required before automation',
    limits: 'Import, reading, review, and sync settings path; must screen locator and fixture stability before automation.'
  },
  {
    id: 'pdf-user-journey',
    spec: 'tests/desktop/pdf-user-journey.spec.ts',
    classification: 'hidden-screening-required',
    triggers: ['T4', 'T5'],
    command: 'npm run test:e2e:desktop:native:hidden -- tests/desktop/pdf-user-journey.spec.ts',
    admission: 'candidate',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; hidden screening required before automation',
    limits: 'PDF canvas and import journey candidate; do not enable until dialog/focus assumptions are screened.'
  },
  {
    id: 'pdf-appearance-mode-switch',
    spec: 'tests/desktop/pdf-appearance-mode-switch.spec.ts',
    classification: 'hidden-screening-required',
    triggers: ['T0', 'T4', 'T5'],
    command: 'npm run test:e2e:desktop:native:hidden -- tests/desktop/pdf-appearance-mode-switch.spec.ts',
    admission: 'candidate',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; hidden screening required before automation',
    limits: 'Appearance/PDF rendering candidate; screen hidden rendering stability before CI use.'
  },
  {
    id: 'text-anchor-navigation',
    spec: 'tests/desktop/text-anchor-breadcrumb-context.spec.ts',
    classification: 'hidden-screening-required',
    triggers: ['T0', 'T4'],
    command: 'npm run test:e2e:desktop:native:hidden -- tests/desktop/text-anchor-breadcrumb-context.spec.ts',
    admission: 'candidate',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; hidden screening required before automation',
    limits: 'Navigation and anchor behavior candidate; choose specific anchor specs per regression target.'
  },
  {
    id: 'global-capture-panel',
    spec: 'tests/desktop/global-capture-panel.spec.ts',
    classification: 'visible-required',
    triggers: ['T2', 'T5'],
    command: 'npm run test:e2e:desktop:native:visible -- tests/desktop/global-capture-panel.spec.ts',
    admission: 'candidate',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; visible native required',
    limits: 'Global capture panel depends on visible OS interaction; never run through hidden regression.'
  },
  {
    id: 'global-capture-toast-navigation',
    spec: 'tests/desktop/global-capture-toast-navigation.spec.ts',
    classification: 'visible-required',
    triggers: ['T2', 'T5'],
    command: 'npm run test:e2e:desktop:native:visible -- tests/desktop/global-capture-toast-navigation.spec.ts',
    admission: 'candidate',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; visible native required',
    limits: 'Toast/navigation behavior is visible-native only unless separately proven hidden-safe.'
  },
  {
    id: 'installed-app-smoke',
    spec: '(release workflow / package verification)',
    classification: 'release-only',
    triggers: ['T5'],
    command: 'npm run quality:release:windows:tail && npm run windows:package:install && node scripts/windows/installed-app-smoke.mjs',
    admission: 'release-only',
    hiddenAutomationCleared: false,
    lastVerified: 'listed; release candidate gate required',
    limits: 'Builds, installs, locates, and launches the installed app with isolated data; updater, tray, and notification remain separate release-only coverage.'
  }
];

export function validateDesktopRegressionSuite(entries = DESKTOP_REGRESSION_SUITE) {
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`duplicate desktop regression id: ${entry.id}`);
    }
    ids.add(entry.id);
    if (!DESKTOP_REGRESSION_CLASSIFICATIONS.has(entry.classification)) {
      throw new Error(`invalid classification for ${entry.id}: ${entry.classification}`);
    }
    if (!DESKTOP_REGRESSION_ADMISSION_STATUSES.has(entry.admission)) {
      throw new Error(`invalid admission status for ${entry.id}: ${entry.admission}`);
    }
    if (!Array.isArray(entry.triggers) || entry.triggers.length === 0) {
      throw new Error(`missing triggers for ${entry.id}`);
    }
    if (!entry.command || !entry.limits || !entry.lastVerified) {
      throw new Error(`missing command, limits, or lastVerified for ${entry.id}`);
    }
    if (typeof entry.hiddenAutomationCleared !== 'boolean') {
      throw new Error(`missing hiddenAutomationCleared for ${entry.id}`);
    }
  }
  return true;
}

export function formatDesktopRegressionSuite(entries = DESKTOP_REGRESSION_SUITE) {
  validateDesktopRegressionSuite(entries);
  return [
    '| id | spec | classification | admission | triggers | hidden automation | last verified | command | limits |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entries.map((entry) => [
      entry.id,
      entry.spec,
      entry.classification,
      entry.admission,
      entry.triggers.join(', '),
      entry.hiddenAutomationCleared ? 'cleared' : 'blocked',
      entry.lastVerified,
      `\`${entry.command}\``,
      entry.limits
    ].join(' | ')).map((row) => `| ${row} |`)
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(formatDesktopRegressionSuite());
}
