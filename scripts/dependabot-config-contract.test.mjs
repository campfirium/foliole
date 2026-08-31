// @vitest-environment node

import fs from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const config = parse(fs.readFileSync('.github/dependabot.yml', 'utf8'));
const updateFor = ecosystem => config.updates.find(update => update['package-ecosystem'] === ecosystem);

describe('Dependabot configuration contract', () => {
  it('keeps ordinary npm version updates limited to mature Electron minor and patch releases', () => {
    const npm = updateFor('npm');

    expect(npm['target-branch']).toBe('dev');
    expect(npm['open-pull-requests-limit']).toBe(1);
    expect(npm.cooldown).toEqual({ 'default-days': 7 });
    expect(npm.allow).toEqual([{ 'dependency-name': 'electron' }]);
    expect(npm.ignore).toEqual([{
      'dependency-name': 'electron',
      'update-types': ['version-update:semver-major']
    }]);
    expect(npm.groups).toBeUndefined();
  });

  it('disables ordinary GitHub Actions version pull requests', () => {
    const actions = updateFor('github-actions');

    expect(actions['open-pull-requests-limit']).toBe(0);
    expect(actions.groups).toBeUndefined();
    expect(actions.ignore).toBeUndefined();
  });
});
