// @vitest-environment node

import { expect, it } from 'vitest';

import { assertDebContents, assertLinuxAcceptanceHost } from './accept-linux-deb.mjs';

it('accepts only the installed Ubuntu release architecture', () => {
  expect(() => assertLinuxAcceptanceHost('linux', 'x64')).not.toThrow();
  expect(() => assertLinuxAcceptanceHost('linux', 'arm64')).toThrow('Linux x64');
  expect(() => assertLinuxAcceptanceHost('darwin', 'x64')).toThrow('Linux x64');
});

it('requires installed integration without Linux updater metadata', () => {
  const contents = [
    './opt/Foliole/foliole',
    './opt/Foliole/bin/foliole',
    './opt/Foliole/bin/foliole-global-clip',
    './opt/Foliole/resources/apparmor-profile',
    './usr/share/applications/foliole.desktop'
  ].join('\n');

  expect(() => assertDebContents(contents)).not.toThrow();
  expect(() => assertDebContents(`${contents}\n./opt/Foliole/resources/app-update.yml`))
    .toThrow('app-update.yml');
});
