// @vitest-environment node

import { expect, it } from 'vitest';

import {
  classifySyncFailure, classifySyncFailureRoute, classifySyncFailureStage
} from './android-sync-failure-classification.mjs';

it.each([
  ['Desktop sync source returned 404.', 'http_404'],
  ['Desktop HTTP request failed. Cause: workgroup_aead_response_required',
    'workgroup_aead_response_required'],
  ['Desktop HTTP request failed. Cause: ConnectException: Failed to connect.', 'connection_failed'],
  ['Failed to apply companion desktop sync pack. constraint failed', 'sync_pack_apply_failed'],
  ['sync_group_departure_authorization_invalid:member_missing', 'sync_group_departure_invalid'],
  ['Unexpected failure detail', 'unclassified']
])('reports a bounded sync failure kind without exposing its detail', (message, expected) => {
  expect(classifySyncFailure({ message, status: 'failed' })).toBe(expected);
});

it.each([
  ['Topic list sync failed: Desktop returned 404.', 'structure'],
  ['Body download sync failed: Desktop returned 404.', 'content'],
  ['Attachment file sync failed: Desktop returned 404.', 'attachment'],
  ['Local change upload failed: Desktop returned 404.', 'push'],
  ['Desktop returned 404.', 'target']
])('reports the public sync stage without retaining error detail', (message, expected) => {
  expect(classifySyncFailureStage({ message, status: 'failed' })).toBe(expected);
});

it('reports only an allowlisted public protocol route', () => {
  expect(classifySyncFailureRoute({
    message: 'Desktop sync source returned 404 for /companion/sync-pack?after=1.',
    status: 'failed'
  })).toBe('/companion/sync-pack');
  expect(classifySyncFailureRoute({
    message: 'Desktop binary resource GET /companion/sync-pack returned 404.',
    status: 'failed'
  })).toBe('/companion/sync-pack');
  expect(classifySyncFailureRoute({
    message: 'Desktop sync source returned 404 for /private/secret.', status: 'failed'
  })).toBeNull();
});
