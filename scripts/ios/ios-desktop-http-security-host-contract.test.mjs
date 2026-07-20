// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS desktop HTTP security host contract', () => {
  it('routes every signed native data request through the redirect blocker', () => {
    const source = fs.readFileSync(
      path.join(root, 'ios/App/App/FolioleCompanionDesktopHttpClient.swift'),
      'utf8'
    );

    expect(source.match(/dataWithoutRedirects\(for: request\)/g)).toHaveLength(2);
    expect(source).toContain('session.data(for: request, delegate: FolioleCompanionRedirectBlocker())');
    expect(source).toMatch(/willPerformHTTPRedirection[\s\S]*completionHandler\(nil\)/);
  });
});
