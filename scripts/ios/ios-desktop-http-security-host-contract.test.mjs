// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('iOS desktop HTTP security host contract', () => {
  const readAppSource = (name) => fs.readFileSync(path.join(root, 'ios/App/App', name), 'utf8');

  it('routes every native desktop request through the redirect blocker', () => {
    const client = readAppSource('FolioleCompanionDesktopHttpClient.swift');
    const attachments = readAppSource('FolioleCompanionAttachmentResourceDownload.swift');
    const framedReceiver = readAppSource('FolioleFramedSyncHTTPReceiver.swift');
    const framedTransport = readAppSource('FolioleFramedSyncHTTPTransport.swift');

    expect(client.match(/FolioleCompanionDesktopHttpTransport\.data\(for: request\)/g)).toHaveLength(2);
    expect(attachments).toContain('FolioleCompanionDesktopHttpTransport.download(for: request)');
    expect(framedTransport).toMatch(/FolioleFramedSyncHTTPReceiver[\s\S]*receiver\.upload/u);
    expect(framedReceiver).toMatch(/willPerformHTTPRedirection[\s\S]*completionHandler\(nil\)/u);
    expect(client).toContain('session.data(for: request, delegate: FolioleCompanionRedirectBlocker())');
    expect(client).toContain('session.download(for: request, delegate: FolioleCompanionRedirectBlocker())');
    expect(client).toMatch(/willPerformHTTPRedirection[\s\S]*completionHandler\(nil\)/);
    expect(client).not.toContain('finishTasksAndInvalidate()');
    expect(client).toContain('configuration.requestCachePolicy = .reloadIgnoringLocalCacheData');
    expect(client).toContain('configuration.httpShouldSetCookies = false');
    expect(client).toContain('configuration.urlCredentialStorage = nil');
    expect(framedTransport).toContain('configuration.httpShouldSetCookies = false');
    expect(framedTransport).toContain('configuration.urlCredentialStorage = nil');
  });

  it('keeps framed transfer on HTTP or HTTPS', () => {
    const framedTransport = readAppSource('FolioleFramedSyncHTTPTransport.swift');
    expect(framedTransport).toContain('["http", "https"].contains(endpoint.scheme?.lowercased() ?? "")');
  });
});
