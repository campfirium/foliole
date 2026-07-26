import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  extractSyncStateFromSqliteBytes,
  parseAndroidSharedPreferences
} from './windows-android-lab-sync-topology-collect.mjs';

describe('Windows Android Lab sync topology collection', () => {
  it('parses Android SharedPreferences values without pairing secret exposure', () => {
    expect(parseAndroidSharedPreferences(`
      <map>
        <string name="device_id">a5-local</string>
        <string name="remote_peer_name">Foliole &amp; Windows</string>
        <int name="negotiated_protocol_version" value="1" />
      </map>
    `)).toMatchObject({
      device_id: 'a5-local',
      negotiated_protocol_version: '1',
      remote_peer_name: 'Foliole & Windows'
    });
  });

  it('extracts endpoint and bounded sync event fields from a device database snapshot', () => {
    const state = extractSyncStateFromSqliteBytes(Buffer.from(
      'SQLite format 3\u0000 workspace_sync_endpoint_url http://192.168.0.11:38641 ' +
      'workspace_sync_events [{"id":"event-1","kind":"push","message":"secret details","occurred_at":"now","result":"ok","status":"completed"}]'
    ));
    expect(state).toMatchObject({
      endpoint_url: 'http://192.168.0.11:38641',
      extraction_mode: 'sqlite-text-scan',
      sync_events: [expect.objectContaining({ id: 'event-1', message: 'secret details' })]
    });
  });
});
