import { rmSync } from 'node:fs';

import { afterEach, expect, it } from 'vitest';

import { windowsCliFixture } from './windows-cli.fixture.mjs';

const fixtures = [];
function fixture() {
  const item = windowsCliFixture();
  fixtures.push(item);
  return item;
}
afterEach(() => {
  for (const item of fixtures.splice(0)) rmSync(item.root, { recursive: true, force: true });
});

it('packages from the public command without personal scripts or installation', () => {
  const subject = fixture();
  const result = subject.run();
  expect(result.status, result.stderr).toBe(0);
  expect(subject.call()).toMatchObject({ args: [], install: false });
  expect(subject.installed()).toBe(false);
});

it.each(['npm_config_install', 'NPM_CONFIG_INSTALL'])('never installs because of inherited %s', variable => {
  const subject = fixture();
  const result = subject.run([], { [variable]: 'true' });
  expect(result.status, result.stderr).toBe(0);
  expect(subject.installed()).toBe(false);
  expect(subject.call()).toEqual({ args: [], install: false });
});

it.each(['--install', '--install-existing', '--internal', '--from-built'])(
  'rejects %s before invoking the packager', option => {
    const subject = fixture();
    const result = subject.run([option]);
    expect(result.status).not.toBe(0);
    expect(subject.call()).toBeNull();
    expect(subject.installed()).toBe(false);
  }
);

it('propagates a packaging failure without retrying or installing', () => {
  const subject = fixture();
  const result = subject.run([], { FIXTURE_PACKAGE_EXIT: '17' });
  expect(result.status).not.toBe(0);
  expect(subject.call()).toMatchObject({ install: false });
  expect(subject.calls()).toHaveLength(1);
  expect(subject.installed()).toBe(false);
});

it('keeps installation available through the explicit registered installation command', () => {
  const subject = fixture();
  const result = subject.run([], {}, 'windows:package:install');
  expect(result.status, result.stderr).toBe(0);
  expect(subject.call()).toMatchObject({ args: ['--install'], install: true });
  expect(subject.installed()).toBe(true);
});
