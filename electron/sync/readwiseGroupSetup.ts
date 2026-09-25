import { isDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { canPrepareReadwiseOnThisHost, loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseSourceModeState } from '../database/readwiseSourceMode.js';
import { loadJsonSetting } from '../database/settingsStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { postDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { loadDesktopSyncGroupMemberEndpoints } from './desktopSyncGroupMemberStateSession.js';
import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { adoptApiProof, decodeApiProof, encodeApiProof, parseApiProof,
  type ApiProof } from './readwiseGroupApiProof.js';
import { activateReadwiseWithHandoff } from './readwiseOwnerHandoff.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export const READWISE_GROUP_SETUP_PATH = '/companion/readwise-group-setup';

type SetupStatus = { deviceId: string; deviceName: string; mode: 'off' | 'relay' | 'api';
  ready: boolean; apiProof: ApiProof | null };
export type ReadwiseJoinDecision = { kind: 'none' | 'waiting' | 'choose' | 'switching';
  devices: Array<{ device_id: string; device_name: string }>; reason?: string };

function isAutomaticOwner() {
  const value = loadJsonSetting('readwise_active_host');
  return Boolean(value && typeof value === 'object' &&
    (value as Record<string, unknown>).selection_source === 'automatic');
}

function localStatus(): SetupStatus {
  const group = loadDesktopSyncGroup();
  if (!group) throw new Error('readwise_group_unavailable');
  const member = group.devices.find((item) => item.device_identity_key === group.local_device_identity_key);
  const state = loadReadwiseSourceModeState();
  const cutover = loadJsonSetting('readwise_source_cutover_v2');
  return { deviceId: group.local_device_identity_key,
    deviceName: member?.device_name ?? group.local_device_identity_key,
    mode: state.mode,
    ready: canPrepareReadwiseOnThisHost(),
    apiProof: state.mode === 'api' && state.completion && !state.conflictReasons.length
      ? { completion: state.completion, cutover } : null };
}

export async function handleReadwiseGroupSetup(bodyText: string, senderId: string) {
  const group = loadDesktopSyncGroup();
  const sender = group?.devices.find((item) => item.device_identity_key === senderId);
  if (!sender || sender.state !== 'active' || !isDesktopSyncGroupPlatform(sender.platform)) {
    throw new Error('readwise_group_member_invalid');
  }
  const request = JSON.parse(bodyText) as { action?: string; automatic?: boolean; proofGzip?: string };
  if (request.action === 'inspect') return localStatus();
  if (request.action === 'adopt-api') {
    adoptApiProof(decodeApiProof(request.proofGzip), senderId);
    return localStatus();
  }
  if (request.action === 'activate') {
    if (request.automatic !== undefined && typeof request.automatic !== 'boolean') {
      throw new Error('readwise_group_setup_invalid');
    }
    const assignment = loadReadwiseHostAssignment();
    return activateReadwiseWithHandoff({ forceCurrent: !request.automatic &&
      assignment.is_active && isAutomaticOwner(),
      selectionSource: request.automatic ? 'automatic' : 'chosen' });
  }
  throw new Error('readwise_group_setup_invalid');
}

async function postSetup(peer: DesktopSyncGroupPeer, request: unknown) {
  await assertDesktopSyncGroupPeerCompatible(peer);
  const secret = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(peer.group_id)?.group_key);
  if (!secret) throw new Error('readwise_group_key_missing');
  return postDesktopWorkgroupJson({ body: JSON.stringify(request), endpointUrl: peer.endpoint_url,
    groupId: peer.group_id, localDeviceId: peer.local_device_id,
    pathWithQuery: READWISE_GROUP_SETUP_PATH, secret });
}

function parseStatus(value: Record<string, unknown>, expectedId: string): SetupStatus {
  if (value.deviceId !== expectedId || typeof value.deviceName !== 'string' ||
      !['off', 'relay', 'api'].includes(String(value.mode)) || typeof value.ready !== 'boolean') {
    throw new Error('readwise_group_status_invalid');
  }
  return value as SetupStatus;
}

function chooseApiProof(statuses: SetupStatus[]) {
  const proofs = statuses.filter((status) => status.apiProof).map((status) => ({
    proof: parseApiProof(status.apiProof), sourceId: status.deviceId
  }));
  if (!proofs.length) return null;
  const first = proofs[0]!;
  if (proofs.some((item) => JSON.stringify(item.proof.completion) !==
      JSON.stringify(first.proof.completion))) {
    throw new Error('readwise_api_migration_conflict');
  }
  return first;
}

async function reconcileMode(statuses: SetupStatus[], peers: Map<string, DesktopSyncGroupPeer>) {
  const proof = chooseApiProof(statuses);
  if (!proof) {
    if (statuses.some((status) => status.mode !== statuses[0]?.mode)) {
      throw new Error('readwise_source_mode_conflict');
    }
    return statuses;
  }
  for (const status of statuses) {
    if (status.mode === 'api' && status.apiProof) continue;
    const peer = peers.get(status.deviceId);
    const result = peer ? await postSetup(peer, { action: 'adopt-api',
      proofGzip: encodeApiProof(proof.proof) })
      : await runWithDatabaseConnectionOwner(() => {
        adoptApiProof(proof.proof, proof.sourceId); return localStatus();
      });
    Object.assign(status, parseStatus(result as Record<string, unknown>, status.deviceId));
  }
  return statuses;
}

export async function resolveReadwiseJoinDecision(): Promise<ReadwiseJoinDecision> {
  const initial = await runWithDatabaseConnectionOwner(() => ({
    assignment: loadReadwiseHostAssignment(), automaticOwner: isAutomaticOwner(),
    group: loadDesktopSyncGroup()
  }));
  if (!initial.group) return { kind: 'none', devices: [] };
  const members = initial.group.devices.filter((device) => device.state === 'active' &&
    isDesktopSyncGroupPlatform(device.platform));
  const peers = new Map(loadDesktopSyncGroupMemberEndpoints(initial.group.group_id)
    .map((peer) => [peer.peer_device_id, peer]));
  const local = await runWithDatabaseConnectionOwner(localStatus);
  if (members.some((member) => member.device_identity_key !== initial.group!.local_device_identity_key &&
      !peers.has(member.device_identity_key))) return !initial.assignment.legacy_unassigned
        ? { kind: 'none', devices: [] } : local.ready
        ? { kind: 'waiting', devices: [], reason: 'peer-offline' }
        : { kind: 'none', devices: [] };
  try {
    const remote = await Promise.all(members.filter((member) => member.device_identity_key !== local.deviceId)
      .map(async (member) => parseStatus(await postSetup(peers.get(member.device_identity_key)!,
        { action: 'inspect' }), member.device_identity_key)));
    const all = [local, ...remote];
    const ownerStatus = all.find((status) =>
      status.deviceId === initial.assignment.active_device_identity_key);
    const statuses = !initial.assignment.legacy_unassigned && ownerStatus?.mode !== 'api'
      ? all : await reconcileMode(all, peers);
    if (!initial.assignment.legacy_unassigned && !initial.automaticOwner) {
      return { kind: 'none', devices: [] };
    }
    if (initial.automaticOwner && statuses.some((status) => status.mode !== ownerStatus?.mode)) {
      return { kind: 'none', devices: [] };
    }
    const eligible = statuses.filter((status) => status.ready);
    if (eligible.length === 0) return { kind: 'none', devices: [] };
    if (initial.automaticOwner && eligible.length < 2) return { kind: 'none', devices: [] };
    if (eligible.length === 1) {
      await selectReadwiseImportDevice(eligible[0]!.deviceId, peers, true);
      const completed = await runWithDatabaseConnectionOwner(() =>
        !loadReadwiseHostAssignment().legacy_unassigned);
      return { kind: completed ? 'none' : 'switching', devices: [] };
    }
    return { kind: 'choose', devices: eligible.map((status) => ({
      device_id: status.deviceId, device_name: status.deviceName
    })) };
  } catch (error) {
    if (!initial.assignment.legacy_unassigned) return { kind: 'none', devices: [] };
    return { kind: 'waiting', devices: [],
      reason: error instanceof Error ? error.message : 'readwise_group_setup_failed' };
  }
}

export async function selectReadwiseImportDevice(deviceId: string,
  peers?: Map<string, DesktopSyncGroupPeer>, automatic = false) {
  const { assignment, autoOwner, group } = await runWithDatabaseConnectionOwner(() => ({
    assignment: loadReadwiseHostAssignment(), autoOwner: isAutomaticOwner(),
    group: loadDesktopSyncGroup()
  }));
  if (!group || !group.devices.some((device) => device.device_identity_key === deviceId &&
      device.state === 'active' && isDesktopSyncGroupPlatform(device.platform))) {
    throw new Error('readwise_device_unavailable');
  }
  if (deviceId === group.local_device_identity_key) return activateReadwiseWithHandoff({
    forceCurrent: assignment.is_active && autoOwner && !automatic,
    selectionSource: automatic ? 'automatic' : 'chosen'
  });
  const peer = peers?.get(deviceId) ?? loadDesktopSyncGroupMemberEndpoints(group.group_id)
    .find((item) => item.peer_device_id === deviceId);
  if (!peer) throw new Error('readwise_member_unreachable');
  return postSetup(peer, { action: 'activate', automatic });
}
