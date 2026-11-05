// @vitest-environment node

import fs from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const config = parse(fs.readFileSync('.github/dependabot.yml', 'utf8'));
const updateFor = ecosystem => config.updates.find(update => update['package-ecosystem'] === ecosystem);

describe('Dependabot configuration contract', () => {
  it('retains security update configuration while ordinary updates belong to Renovate', () => {
    const npm = updateFor('npm');

    expect(npm['target-branch']).toBe('dev');
    expect(npm.schedule).toEqual({
      interval: 'daily',
      time: '09:00',
      timezone: 'Asia/Shanghai'
    });
    expect(npm['open-pull-requests-limit']).toBe(0);
    expect(npm.cooldown).toBeUndefined();
    expect(npm.allow).toEqual([
      { 'dependency-name': 'electron' },
      { 'dependency-name': 'better-sqlite3' },
      {
        'dependency-name': '*',
        'dependency-type': 'direct',
        'update-types': ['version-update:semver-patch', 'version-update:semver-minor']
      }
    ]);
    expect(npm.ignore).toBeUndefined();
    expect(npm['commit-message']).toEqual({ prefix: 'deps', 'prefix-development': 'deps-dev' });
  });

  it('groups ordinary updates by impact without mixing core or native dependencies', () => {
    const groups = updateFor('npm').groups;
    expect(Object.keys(groups)).toEqual([
      'mobile-host', 'editor', 'interface', 'development', 'runtime-support'
    ]);
    for (const group of Object.values(groups)) {
      expect(group['update-types']).toEqual(['patch', 'minor']);
    }
    expect(groups['mobile-host'].patterns).toContain('@capacitor-community/sqlite');
    expect(groups.editor.patterns).toEqual(['@codemirror/*', '@lezer/*']);
    expect(groups.development['dependency-type']).toBe('development');
    expect(groups.development['exclude-patterns']).toContain('electron');
    expect(groups['runtime-support']['dependency-type']).toBe('production');
    expect(groups['runtime-support']['exclude-patterns']).toEqual(expect.arrayContaining([
      'better-sqlite3', 'ts-fsrs', '@noble/hashes', 'react-pdf', 'pdfjs-dist'
    ]));
  });

  it('omits disabled package ecosystems instead of retaining inert schedules', () => {
    expect(updateFor('github-actions')).toBeUndefined();
  });

  it('retains native security update coverage without competing ordinary proposals', () => {
    const native = config.updates.filter(update => ['gradle', 'swift'].includes(update['package-ecosystem']));
    expect(native.map(update => [update['package-ecosystem'], update.directory]))
      .toEqual(expect.arrayContaining([
        ['gradle', '/android'],
        ['swift', '/ios/App'],
        ['swift', '/ios/App/FramedSyncRuntimePackage']
      ]));
    for (const update of native) {
      expect(fs.existsSync(`.${update.directory}/${update['package-ecosystem'] === 'swift' ? 'Package.swift' : 'build.gradle'}`))
        .toBe(true);
      expect(update['target-branch']).toBe('dev');
      expect(update.schedule).toMatchObject({ interval: 'daily', timezone: 'Asia/Shanghai' });
      expect(update['open-pull-requests-limit']).toBe(0);
      expect(update.ignore).toBeUndefined();
      expect(update.allow).toBeUndefined();
    }
    expect(native.some(update => update.directory.includes('CapApp-SPM'))).toBe(false);
  });
});

describe('Renovate update ownership', () => {
  const renovate = JSON.parse(fs.readFileSync('.github/renovate.json', 'utf8'));

  it('raises reviewable PRs directly without a dashboard approval step', () => {
    expect(renovate.dependencyDashboard).toBe(false);
    expect(renovate.dependencyDashboardApproval ?? false).toBe(false);
    expect(renovate.automerge).toBe(false);
    expect(renovate.vulnerabilityAlerts.enabled).toBe(false);
    const preapprovals = renovate.packageRules.filter(rule => rule.dependencyDashboardApproval);
    expect(preapprovals).toEqual([]);
  });

  it('does not defer eligible proposals through a schedule or PR and branch quotas', () => {
    expect(renovate.schedule ?? []).toEqual([]);
    expect(renovate.prConcurrentLimit).toBe(0);
    expect(renovate.prHourlyLimit).toBe(0);
    // Renovate's null branch limit inherits the PR concurrency limit.
    expect(renovate.branchConcurrentLimit ?? renovate.prConcurrentLimit).toBe(0);
  });

  it('preserves Node engine ranges without changing ordinary dependency pinning', () => {
    expect(renovate.rangeStrategy).toBe('pin');
    expect(renovate.packageRules).toContainEqual(expect.objectContaining({
      matchManagers: ['npm'],
      matchDepTypes: ['engines'],
      matchPackageNames: ['node'],
      rangeStrategy: 'replace'
    }));
  });

  it('discovers owned manifests and limits the existing release-age delay to npm', () => {
    expect(renovate.packageRules.some(rule => rule.enabled === false)).toBe(false);
    expect(renovate.minimumReleaseAge).toBeUndefined();
    expect(renovate.packageRules).toContainEqual(expect.objectContaining({
      matchManagers: ['npm'], minimumReleaseAge: '7 days'
    }));
    expect(renovate.packageRules).toContainEqual(expect.objectContaining({
      matchManagers: ['npm'], matchPackageNames: ['electron'], minimumReleaseAge: '0 days'
    }));
    expect(renovate.ignorePaths).toEqual(expect.arrayContaining([
      '**/node_modules/**', 'ios/App/CapApp-SPM/**',
      'android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle'
    ]));
  });
});
