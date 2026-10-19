// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('allows daily Sync Now evidence while keeping general projection isolated', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java', 'utf8');
  const guard = name => {
    const start = source.indexOf(`static JSONObject ${name}(Context context)`);
    const body = source.slice(start).split('        return readDatabase(context);')[0];
    return body.slice(body.indexOf('{') + 1);
  };
  const acceptance = source.match(/static boolean isAcceptancePackage\(String packageName\) \{[^}]+\}/u)[0];
  const syncGuard = source.includes('static JSONObject readForSyncNow(')
    ? guard('readForSyncNow') : source.match(/static JSONObject read\(Context context\)[\s\S]+?(?= {8}String path)/u)[0].split('throws Exception {')[1];
  const generalGuard = source.includes('return readDatabase(context);') ? guard('read') : syncGuard;
  const java = `public class IdentityFixture {
    record Context(String value) { String getPackageName() { return value; } }
    ${acceptance}
    static void sync(Context context) { ${syncGuard} }
    static void general(Context context) { ${generalGuard} }
    public static void main(String[] args) {
      sync(new Context("com.campfirium.foliole.android"));
      sync(new Context("com.campfirium.foliole.android.acceptance"));
      try { sync(new Context("other")); throw new AssertionError("Foreign package accepted"); }
      catch (IllegalStateException expected) {}
      try { general(new Context("com.campfirium.foliole.android")); throw new AssertionError("General scope expanded"); }
      catch (IllegalStateException expected) {}
    }
  }`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-sync-identity-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const file = path.join(directory, 'IdentityFixture.java');
    fs.writeFileSync(file, java);
    const compile = spawnSync(binary('javac'), ['-d', directory, file], { encoding: 'utf8', timeout: 30000 });
    expect(compile.stderr).toBe('');
    expect(compile.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'IdentityFixture'], { encoding: 'utf8', timeout: 5000 });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
