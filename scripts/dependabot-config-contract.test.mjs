// @vitest-environment node

import fs from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const config = parse(fs.readFileSync('.github/dependabot.yml', 'utf8'));
const updateFor = ecosystem => config.updates.find(update => update['package-ecosystem'] === ecosystem);

describe('Dependabot configuration contract', () => {
  it('signals direct patch and minor updates while keeping native exceptions separate', () => {
    const npm = updateFor('npm');

    expect(npm['target-branch']).toBe('dev');
    expect(npm.schedule).toEqual({
      interval: 'daily',
      time: '09:00',
      timezone: 'Asia/Shanghai'
    });
    expect(npm['open-pull-requests-limit']).toBe(10);
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
});
