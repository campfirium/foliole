/* global fetch, URL */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { SQLCIPHER_ADVISORY } from './ios-security-sources.mjs';

// External publisher fixture only; acquisition, parsing, coverage, owner and transport remain production paths.
export async function startOfficialPublisher(now) {
  const state = { failure: false, malformed: false, advisories: [] };
  const server = createServer((request, response) => {
    response.setHeader('date', new Date(now).toUTCString());
    if (state.failure) { response.writeHead(503); response.end('unavailable'); return; }
    if (state.malformed) { response.end('invalid source payload'); return; }
    if (request.url.includes('/security-advisories')) response.end(JSON.stringify(state.advisories));
    else if (request.url.includes('/repos/')) response.end(JSON.stringify([
      { tag_name: 'v4.20.0', body: '', published_at: '2026-10-27T00:00:00Z', prerelease: false,
        html_url: 'https://github.com/sqlcipher/sqlcipher/releases/tag/v4.20.0' },
      { tag_name: 'v4.19.0', body: `security hexkey sqlcipher_export ${SQLCIPHER_ADVISORY}`,
        published_at: '2026-09-08T00:00:00Z', prerelease: false,
        html_url: 'https://github.com/sqlcipher/sqlcipher/releases/tag/v4.19.0' }
    ]));
    else if (request.url.includes('/rss/')) response.end(APPLE_RSS);
    else if (request.url.includes('/100100')) response.end(APPLE_SECURITY);
    else if (request.url.includes('/149227')) response.end('WebKit CVE-2026-86971');
    else response.end(SQLITE_CVES);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { state, close: () => new Promise(resolve => server.close(resolve)),
    fetchSource: (url, options) => fetch(`${origin}${new URL(url).pathname}`, options) };
}

export const APPLE_RSS = '<rss version="2.0"><channel><title>Releases - Apple Developer</title><item>'
  + '<title>iOS 27.2</title><link>https://developer.apple.com/news/releases/?id=10262026a</link>'
  + '<pubDate>Mon, 26 Oct 2026 10:00:00 PDT</pubDate></item></channel></rss>';
export const APPLE_SECURITY = 'Apple security releases Release&nbsp;date <table><tr><td>'
  + '<a href="https://support.apple.com/en-us/149227">iOS 26.7.2</a></td><td>iPhone</td><td>20 Oct 2026</td></tr>'
  + '<tr><td><a href="https://support.apple.com/en-us/149230">iOS 27.2</a></td><td>iPhone</td><td>26 Oct 2026</td></tr></table>';
export const SQLITE_CVES = 'Status Of Recent SQLite CVEs <table><tr><td>CVE-2026-11822</td><td>3.53.2</td>'
  + '<td>Requires arbitrary SQL and FTS5</td></tr><tr><td>CVE-2023-32697</td><td>Not a bug in the core SQLite library</td>'
  + '<td>Wrapper issue</td></tr></table>';
