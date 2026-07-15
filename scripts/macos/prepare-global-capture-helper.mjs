import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT_DIR = path.join(ROOT, '.tmp/macos/global-capture-helper');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'Foliole Global Capture');
const SOURCE_PATH = path.join(ROOT, 'scripts/macos/native/FolioleGlobalCapture.m');

export async function prepareGlobalCaptureHelper() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await execFileAsync('xcrun', [
    'clang', '-fobjc-arc', '-mmacosx-version-min=12.0',
    SOURCE_PATH, '-framework', 'AppKit', '-framework', 'ApplicationServices', '-framework', 'Carbon',
    '-o', OUTPUT_PATH
  ]);
  return OUTPUT_PATH;
}
