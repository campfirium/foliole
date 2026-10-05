type JsonObject = Record<string, unknown>;

export interface CanonicalPrivateStateIdentity {
  form_factor: string;
  host_name: string;
  key: string;
  platform: string;
  scope: string;
}

export interface CanonicalSettingSyncPayload extends CanonicalPrivateStateIdentity {
  value_json: string;
}

export type CanonicalViewStateSyncPayload = CanonicalPrivateStateIdentity & (
  | { active_node_id: string | null }
  | {
    node_id: string;
    scroll_top: number;
    selection_from: number | null;
    selection_to: number | null;
  }
);

export function buildCanonicalSettingSyncPayload(input: CanonicalSettingSyncPayload) {
  return { host_name: input.host_name, form_factor: input.form_factor, key: input.key,
    platform: input.platform, scope: input.scope, value_json: input.value_json };
}

export function buildCanonicalViewStateSyncPayload(input: CanonicalViewStateSyncPayload) {
  const identity = { host_name: input.host_name, form_factor: input.form_factor, key: input.key,
    platform: input.platform, scope: input.scope };
  if ('active_node_id' in input) return { ...identity, active_node_id: input.active_node_id };
  return { ...identity, node_id: input.node_id, scroll_top: input.scroll_top,
    selection_from: input.selection_from, selection_to: input.selection_to };
}

export function normalizeCanonicalPrivateStatePayload(objectType: string, value: unknown) {
  const input = asObject(value);
  const identity = input && readIdentity(input);
  if (!input || !identity) return null;
  if (objectType === 'setting') {
    const valueJson = string(input.value_json);
    return valueJson === null ? null : buildCanonicalSettingSyncPayload({ ...identity, value_json: valueJson });
  }
  if (objectType !== 'view_state') return null;
  if (identity.key === 'active_node') {
    const activeNodeId = nullableString(input.active_node_id);
    return activeNodeId === undefined ? null : buildCanonicalViewStateSyncPayload({
      ...identity, active_node_id: activeNodeId
    });
  }
  const nodeId = string(input.node_id);
  const scrollTop = number(input.scroll_top);
  const selectionFrom = nullableNumber(input.selection_from);
  const selectionTo = nullableNumber(input.selection_to);
  if (!identity.key.startsWith('node:') || nodeId === null || scrollTop === null ||
      selectionFrom === undefined || selectionTo === undefined) return null;
  return buildCanonicalViewStateSyncPayload({
    ...identity, node_id: nodeId, scroll_top: scrollTop,
    selection_from: selectionFrom, selection_to: selectionTo
  });
}

export function canonicalPrivateStatePayloadJson(objectType: string, value: unknown) {
  const payload = normalizeCanonicalPrivateStatePayload(objectType, value);
  return payload ? JSON.stringify(payload) : null;
}

function readIdentity(input: JsonObject): CanonicalPrivateStateIdentity | null {
  const formFactor = string(input.form_factor);
  const hostName = string(input.host_name);
  const key = string(input.key);
  const platform = string(input.platform);
  const scope = string(input.scope);
  return formFactor && hostName && key && platform && scope
    ? { form_factor: formFactor, host_name: hostName, key, platform, scope }
    : null;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function string(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown) {
  return value === null ? null : typeof value === 'string' ? value : undefined;
}

function nullableNumber(value: unknown) {
  return value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
