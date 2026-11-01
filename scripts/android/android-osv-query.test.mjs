// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { queryAndroidMavenAdvisories } from './android-osv-query.mjs';

const module = version => ({ group: 'com.google.protobuf', name: 'protobuf-java', version });
const response = results => ({ ok: true, json: async () => ({ results }) });

describe('Maven advisory source', () => {
  it('keeps version-specific results and queries only unfinished pages', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response([
      { vulns: [{ id: 'GHSA-735f-pc8j-v9w8' }], next_page_token: 'next' }, {}
    ])).mockResolvedValueOnce(response([{ vulns: [{ id: 'ANOTHER-ID' }] }]));
    const report = await queryAndroidMavenAdvisories([module('3.25.4'), module('3.25.5')], { fetchImpl });
    expect(report.results.map(row => row.status)).toEqual(['findings', 'clean']);
    expect(report.results[0].advisories.map(row => row.id)).toEqual(['GHSA-735f-pc8j-v9w8', 'ANOTHER-ID']);
    const queries = fetchImpl.mock.calls.map(([, options]) => JSON.parse(options.body).queries);
    expect(queries[0].map(query => query.version)).toEqual(['3.25.4', '3.25.5']);
    expect(queries[1]).toEqual([{ package: { ecosystem: 'Maven', name: 'com.google.protobuf:protobuf-java' },
      version: '3.25.4', page_token: 'next' }]);
  });

  it.each([
    ['HTTP failure', { ok: false, status: 503 }],
    ['empty body', { ok: true, json: async () => { throw new SyntaxError('empty body'); } }],
    ['missing result', { ok: true, json: async () => ({ results: [] }) }],
    ['invalid advisory', response([{ vulns: [{}] }])],
    ['unexpected error body', response([{ error: 'not supported' }])],
    ['invalid page token', response([{ next_page_token: 123 }])]
  ])('reports %s as an error, never as no known vulnerabilities', async (_name, payload) => {
    const report = await queryAndroidMavenAdvisories([module('3.25.4')], { fetchImpl: async () => payload });
    expect(report.results[0].status).toBe('error');
    expect(report.results[0].error).toBeTruthy();
  });

  it('retains findings when a later page fails and stops repeated tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response([
      { vulns: [{ id: 'KNOWN-ID' }], next_page_token: 'repeat' }
    ])).mockResolvedValue(response([{ next_page_token: 'repeat' }]));
    const report = await queryAndroidMavenAdvisories([module('3.25.4')], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(report.results[0]).toMatchObject({ status: 'error', advisories: [{ id: 'KNOWN-ID' }] });
  });

  it('does not invent Maven coordinates for dynamic or unidentified versions', async () => {
    const fetchImpl = vi.fn();
    const report = await queryAndroidMavenAdvisories([module('+'), module('1.0-SNAPSHOT'),
      { group: '', name: 'local.jar', version: 'unspecified' }], { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.results.every(row => row.status === 'unsupported')).toBe(true);
  });

  it('keeps successful packages when another result is malformed', async () => {
    const report = await queryAndroidMavenAdvisories([module('3.25.4'), module('3.25.5')], {
      fetchImpl: async () => response([{ vulns: 'invalid' }, {}])
    });
    expect(report.results.map(row => row.status)).toEqual(['error', 'clean']);
  });
});
