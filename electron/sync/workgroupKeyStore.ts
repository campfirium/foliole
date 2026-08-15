import { createHash, randomBytes } from 'node:crypto';

import {
  consumeDesktopSyncGroupNonce,
  loadDesktopSyncGroupWorkgroupKey,
  saveDesktopSyncGroupWorkgroupKey
} from '../database/syncGroupWorkgroupStore.js';

function tagForKey(groupKey: string) {
  return createHash('sha256').update(Buffer.from(groupKey, 'base64url')).digest('hex').slice(0, 32);
}

function requireWorkgroupKey(groupKey: string) {
  if (Buffer.from(groupKey, 'base64url').byteLength !== 32) {
    throw new Error('sync_group_workgroup_key_invalid');
  }
  return groupKey;
}

export function enableDesktopWorkgroupKey(groupId: string) {
  const existing = loadDesktopSyncGroupWorkgroupKey(groupId);
  const groupKey = existing ?? randomBytes(32).toString('base64url');
  if (!existing) saveDesktopSyncGroupWorkgroupKey(groupId, groupKey);
  return { group_id: groupId, group_key: groupKey, group_tag: tagForKey(groupKey) };
}

export function saveDesktopWorkgroupKey(args: { groupId: string; groupKey: string }) {
  const groupKey = requireWorkgroupKey(args.groupKey);
  saveDesktopSyncGroupWorkgroupKey(args.groupId, groupKey);
  return { group_id: args.groupId, group_key: groupKey, group_tag: tagForKey(groupKey) };
}

export function loadDesktopWorkgroupKey(groupId: string) {
  const groupKey = loadDesktopSyncGroupWorkgroupKey(groupId);
  if (!groupKey) return null;
  requireWorkgroupKey(groupKey);
  return { group_id: groupId, group_key: groupKey, group_tag: tagForKey(groupKey) };
}

export function consumeDesktopWorkgroupNonce(groupId: string, identity: string, nowMs = Date.now()) {
  return consumeDesktopSyncGroupNonce(groupId, identity, nowMs, nowMs + 60_000);
}
