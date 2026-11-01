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

// File matching also considers lockfiles, so exclusions must preserve both root files.
describe('Renovate update ownership', () => {
  const renovate = JSON.parse(fs.readFileSync('.github/renovate.json', 'utf8'));

  it('allows routine proposals while requiring review for major and native database updates', () => {
    expect(renovate.dependencyDashboardApproval).toBe(false);
    expect(renovate.automerge).toBe(false);
    expect(renovate.vulnerabilityAlerts.enabled).toBe(false);
    expect(renovate.prConcurrentLimit).toBeLessThanOrEqual(2);
    expect(renovate.packageRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchUpdateTypes: ['major'], dependencyDashboardApproval: true }),
      expect.objectContaining({
        matchPackageNames: expect.arrayContaining(['electron', 'better-sqlite3', '@capacitor-community/sqlite']),
        dependencyDashboardApproval: true
      })
    ]));
  });

  it('excludes nested npm manifests without excluding the root manifest or lockfile', () => {
    const exclusion = renovate.packageRules.find(rule => rule.enabled === false && rule.matchManagers.includes('npm'));
    // These positive regexes describe the exclusion domain, including every lockfile candidate.
    const patterns = exclusion.matchFileNames.map(pattern => {
      expect(pattern.startsWith('/')).toBe(true);
      expect(pattern.endsWith('/')).toBe(true);
      return new RegExp(pattern.slice(1, -1));
    });
    const excluded = file => patterns.some(pattern => pattern.test(file));
    expect(excluded('package.json')).toBe(false);
    expect(excluded('package-lock.json')).toBe(false);
    expect(excluded('electron/native/foliole-desktop-dnssd/package.json')).toBe(true);
    expect(excluded('scripts/oneoff/package.json')).toBe(true);
  });
});
