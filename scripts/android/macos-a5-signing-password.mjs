import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export function uploadSigningPassword(config) {
  let password;
  if (config.keychain) {
    const result = spawnSync('/usr/bin/security', ['find-generic-password',
      '-s', config.keychain.service, '-a', config.keychain.account, '-w'],
    { encoding: 'utf8', timeout: 15000 });
    if (result.error || result.status !== 0) {
      throw new Error('Upload signing Keychain password is unavailable.');
    }
    password = result.stdout.replace(/\r?\n$/u, '');
  } else {
    password = fs.readFileSync(config.passwordFile, 'utf8').trimEnd();
  }
  if (!password || /[\r\n]/u.test(password)) throw new Error('Upload signing password is invalid.');
  return password;
}
