// @vitest-environment node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';

it('prepares the native database before a real Capacitor copy-only build', () => {
  const parent = path.resolve('.tmp/artifacts/mobile-sqlcipher-hooks');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'copy-'));
  try {
    const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
    fs.mkdirSync(path.join(root, 'scripts/build'), { recursive: true });
    fs.mkdirSync(path.join(root, 'www'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ios/App/App'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'native-copy-fixture',
      scripts: scripts['capacitor:copy:before'] ? { 'capacitor:copy:before': scripts['capacitor:copy:before'] } : {} }));
    fs.writeFileSync(path.join(root, 'capacitor.config.json'), JSON.stringify({
      appId: 'com.example.nativecopy', appName: 'Native copy fixture', webDir: 'www' }));
    fs.writeFileSync(path.join(root, 'www/index.html'), '<html><head></head><body>Native fixture</body></html>');
    fs.writeFileSync(path.join(root, 'scripts/build/mobile-sqlcipher.mjs'),
      "import fs from 'node:fs'; if (fs.existsSync('ios/App/App/public/index.html')) throw new Error('Native preparation ran after copy'); fs.writeFileSync('native-platform.txt', process.env.CAPACITOR_PLATFORM_NAME);\n");
    const result = spawnSync(process.execPath, [path.resolve('node_modules/@capacitor/cli/bin/capacitor'), 'copy', 'ios'],
      { cwd: root, encoding: 'utf8', timeout: 30000 });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(fs.existsSync(path.join(root, 'native-platform.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'native-platform.txt'), 'utf8')).toBe('ios');
    expect(fs.existsSync(path.join(root, 'ios/App/App/public/index.html'))).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
