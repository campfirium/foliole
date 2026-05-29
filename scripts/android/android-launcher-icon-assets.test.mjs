// @vitest-environment node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RES_ROOT = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'res');
const FOREGROUND_XXXHDPI = path.join(
  RES_ROOT,
  'mipmap-xxxhdpi',
  'ic_launcher_foreground.png'
);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('Android launcher icon assets', () => {
  it('uses the Foliole mipmap foreground instead of Android template drawables', async () => {
    const iconXml = await readFile(
      path.join(RES_ROOT, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
      'utf8'
    );
    const roundIconXml = await readFile(
      path.join(RES_ROOT, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'),
      'utf8'
    );

    expect(iconXml).toContain('@mipmap/ic_launcher_foreground');
    expect(roundIconXml).toContain('@mipmap/ic_launcher_foreground');
    expect(iconXml).not.toContain('@drawable/ic_launcher_foreground');
    expect(roundIconXml).not.toContain('@drawable/ic_launcher_foreground');
    await expect(
      exists(path.join(RES_ROOT, 'drawable-v24', 'ic_launcher_foreground.xml'))
    ).resolves.toBe(false);
    await expect(
      exists(path.join(RES_ROOT, 'drawable', 'ic_launcher_background.xml'))
    ).resolves.toBe(false);
  });

  it('keeps the adaptive icon transparent and inside the Android mask safe area', async () => {
    const backgroundXml = await readFile(
      path.join(RES_ROOT, 'values', 'ic_launcher_background.xml'),
      'utf8'
    );
    const nightBackgroundXml = await readFile(
      path.join(RES_ROOT, 'values-night', 'ic_launcher_background.xml'),
      'utf8'
    );
    const foregroundPng = await readFile(FOREGROUND_XXXHDPI);

    expect(backgroundXml).toContain('#FFFFFFFF');
    expect(nightBackgroundXml).toContain('#FF111411');
    expect(foregroundPng.subarray(0, 4)).toEqual(PNG_SIGNATURE);
    expect(foregroundPng.readUInt32BE(16)).toBe(432);
    expect(foregroundPng.readUInt32BE(20)).toBe(432);
  });

  it('has a repeatable source-image generator for Android icon assets', async () => {
    const packageJson = await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8');
    const generator = await readFile(
      path.join(REPO_ROOT, 'scripts', 'android', 'generate-launcher-icons.py'),
      'utf8'
    );

    expect(packageJson).toContain('"android:icons:generate"');
    expect(generator).toContain('SOURCE_ICON = REPO_ROOT / "build" / "icon.png"');
    expect(generator).toContain('LIGHT_BACKGROUND = "#FFFFFFFF"');
    expect(generator).toContain('DARK_BACKGROUND = "#FF111411"');
    expect(generator).toContain('round(size * 0.58)');
  });
});
