// @vitest-environment node

import fs from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const config = parse(fs.readFileSync('.github/dependabot.yml', 'utf8'));
const updateFor = ecosystem => config.updates.find(update => update['package-ecosystem'] === ecosystem);

describe('Dependabot configuration contract', () => {
  it('uses the one-day cooldown only for the Electron version updater on dev', () => {
    const npm = updateFor('npm');

    expect(npm['target-branch']).toBe('dev');
    expect(npm.schedule).toEqual({
      interval: 'daily',
      time: '09:00',
      timezone: 'Asia/Shanghai'
    });
    expect(npm['open-pull-requests-limit']).toBe(1);
    expect(npm.cooldown).toEqual({ 'default-days': 1 });
    expect(npm.allow).toEqual([{ 'dependency-name': 'electron' }]);
    expect(npm.ignore).toBeUndefined();
    expect(npm.groups).toBeUndefined();
    expect(npm['commit-message']).toEqual({ prefix: 'deps', 'prefix-development': 'deps-dev' });
  });

  it('omits disabled package ecosystems instead of retaining inert schedules', () => {
    expect(updateFor('github-actions')).toBeUndefined();
  });
});
