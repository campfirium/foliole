import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAllowedLocalOpenPath } from './localOpenPathGuard.js';
import type { AppPaths } from './paths.js';

const appPaths: AppPaths = {
  app_cache_dir: '/app/cache',
  app_config_dir: '/app/config',
  app_data_dir: '/app/data',
  app_log_dir: '/app/logs',
  documents_dir: '/Users/me/Documents'
};

const normalizedPath = (filePath: string) => path.normalize(filePath);

describe('resolveAllowedLocalOpenPath', () => {
  it('rejects empty, relative, URL, and network paths', () => {
    expect(resolveAllowedLocalOpenPath('', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('../source.md', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('file:///tmp/source.md', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('http://example.com/source.md', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('\\\\server\\share\\source.md', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('//server/share/source.md', appPaths)).toBeNull();
  });

  it('rejects dangerous executable and script file extensions', () => {
    expect(resolveAllowedLocalOpenPath('/tmp/install.exe', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('/tmp/run.BAT', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('C:\\Users\\me\\script.ps1', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('/tmp/package.msi', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('C:\\Users\\me\\Desktop\\App.lnk', appPaths)).toBeNull();
  });

  it('accepts document file paths only inside allowed roots', () => {
    expect(resolveAllowedLocalOpenPath('/tmp/source.md', appPaths)).toBeNull();
    expect(resolveAllowedLocalOpenPath('/Users/me/Documents/source.md', appPaths)).toBe(
      normalizedPath('/Users/me/Documents/source.md')
    );
    expect(resolveAllowedLocalOpenPath('C:\\Users\\me\\book.pdf', appPaths)).toBeNull();
  });

  it('accepts only allowed directories', () => {
    expect(resolveAllowedLocalOpenPath('/app/logs', appPaths)).toBe(normalizedPath('/app/logs'));
    expect(resolveAllowedLocalOpenPath('/app/data/session', appPaths)).toBe(normalizedPath('/app/data/session'));
    expect(resolveAllowedLocalOpenPath('/Users/me/Documents', appPaths)).toBe(normalizedPath('/Users/me/Documents'));
    expect(resolveAllowedLocalOpenPath('/tmp', appPaths)).toBeNull();
  });

  it('normalizes paths before checking app-managed directory prefixes', () => {
    expect(resolveAllowedLocalOpenPath('/app/logs/../data', appPaths)).toBe(normalizedPath('/app/data'));
    expect(resolveAllowedLocalOpenPath('/app/logs/../../tmp', appPaths)).toBeNull();
  });
});
