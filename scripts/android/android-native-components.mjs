import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function inspectAndroidNativeComponents(inventory) {
  const artifacts = new Map(inventory.configurations.flatMap(scope => scope.nativeArtifacts ?? [])
    .map(artifact => [artifact.file, artifact]));
  if (artifacts.size !== 1) throw new Error('Expected one actual SQLCipher artifact across runtime variants');
  return [...artifacts.values()].map(artifact => {
    const sha256 = createHash('sha256').update(readFileSync(artifact.file)).digest('hex');
    if (sha256 !== artifact.sha256) throw new Error('Resolved native artifact changed after extraction');
    const entries = execFileSync('unzip', ['-Z1', artifact.file], { encoding: 'utf8' }).split('\n')
      .filter(name => /^jni\/[^/]+\/libsqlcipher\.so$/u.test(name));
    if (!entries.length) throw new Error('Resolved SQLCipher AAR contains no native libraries');
    const libraries = entries.map(entry => {
      const bytes = execFileSync('unzip', ['-p', artifact.file, entry], { maxBuffer: 32 * 1024 * 1024 });
      const strings = bytes.toString('latin1').match(/[\x20-\x7e]{4,}/gu) ?? [];
      const sqlite = [...new Set(strings.filter(value => /^3\.\d+\.\d+$/u.test(value)))];
      const crypto = [...new Set(strings.filter(value => /^1\.\d+\.\d+$/u.test(value)))];
      const provider = strings.includes('libtomcrypt') ? 'LibTomCrypt' : 'unknown';
      return { entry, sha256: createHash('sha256').update(bytes).digest('hex'),
        sqlcipher: strings.includes(artifact.version) ? artifact.version : 'unknown',
        sqlite: sqlite.length === 1 ? sqlite[0] : 'unknown', provider,
        crypto: provider === 'LibTomCrypt' && crypto.length === 1 ? crypto[0] : 'unknown',
        qualification: 'binary-identification; vendor-fork-patches-and-runtime-behaviour-not-proven' };
    });
    return { ...artifact, sha256, libraries };
  });
}
