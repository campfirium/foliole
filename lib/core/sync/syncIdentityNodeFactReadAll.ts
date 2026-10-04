import type { SyncIdentityNodeFactDescription } from './syncIdentityNodeFactComparison.js';
import type { SyncIdentityNodeFactSection } from './syncIdentityNodeFactPage.js';
import type { SyncParentFact, SyncVersionFact } from './syncPackFactPresence.js';

const SECTIONS = ['versions', 'parents', 'reviews', 'requirements'] as const;
const HEX = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();

interface FactPage {
  node_id: string;
  section: SyncIdentityNodeFactSection;
  fact_digest: string;
  requirements_digest: string;
  head_id: string | null;
  entries: unknown[];
  nextAfter: string | null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sync_identity_node_fact_page_invalid');
  }
  return value as Record<string, unknown>;
}

function validEntry(section: SyncIdentityNodeFactSection, entry: unknown) {
  const row = record(entry);
  if (section === 'versions') {
    if (![row.version_id, row.object_id, row.host_name, row.created_at,
      row.content_hash, row.snapshot_metadata].every((value) => typeof value === 'string') ||
        row.parent_version_id !== null && typeof row.parent_version_id !== 'string' ||
        row.body_hash !== null && typeof row.body_hash !== 'string') {
      throw new Error('sync_identity_node_fact_page_invalid');
    }
  } else if (section === 'parents') {
    if (typeof row.version_id !== 'string' ||
        typeof row.parent_version_id !== 'string' ||
        !Number.isSafeInteger(row.ordinal) || (row.ordinal as number) < 0) {
      throw new Error('sync_identity_node_fact_page_invalid');
    }
  } else if (section === 'reviews') {
    if (typeof row.op_id !== 'string' || typeof row.node_id !== 'string' ||
        !['id', 'host_name', 'grade', 'scheduler_version', 'reviewed_at',
          'due_before', 'stability_before', 'difficulty_before', 'due_after',
          'stability_after'].every((key) => key in row)) {
      throw new Error('sync_identity_node_fact_page_invalid');
    }
  } else if (typeof row.version_id !== 'string' ||
      ![0, 1].includes(row.frozen as number)) {
    throw new Error('sync_identity_node_fact_page_invalid');
  }
  return row;
}

function cursor(section: SyncIdentityNodeFactSection, row: Record<string, unknown>) {
  return section === 'versions' || section === 'requirements'
    ? row.version_id as string : section === 'reviews' ? row.op_id as string
      : JSON.stringify([row.version_id, row.ordinal, row.parent_version_id]);
}

function ordered(section: SyncIdentityNodeFactSection, prior: Record<string, unknown>,
  current: Record<string, unknown>) {
  if (section !== 'parents') return cursor(section, prior) < cursor(section, current);
  const priorVersion = prior.version_id as string;
  const currentVersion = current.version_id as string;
  if (priorVersion !== currentVersion) return priorVersion < currentVersion;
  const priorOrdinal = prior.ordinal as number;
  const currentOrdinal = current.ordinal as number;
  return priorOrdinal !== currentOrdinal ? priorOrdinal < currentOrdinal :
    (prior.parent_version_id as string) < (current.parent_version_id as string);
}

function afterRow(section: SyncIdentityNodeFactSection, after: string) {
  if (section !== 'parents') return { version_id: after, op_id: after };
  let tuple: unknown;
  try { tuple = JSON.parse(after); }
  catch { throw new Error('sync_identity_node_fact_page_invalid'); }
  if (!Array.isArray(tuple) || tuple.length !== 3 ||
      typeof tuple[0] !== 'string' || !Number.isSafeInteger(tuple[1]) ||
      typeof tuple[2] !== 'string') {
    throw new Error('sync_identity_node_fact_page_invalid');
  }
  return { version_id: tuple[0], ordinal: tuple[1], parent_version_id: tuple[2] };
}

function assertEntryOrder(section: SyncIdentityNodeFactSection,
  entries: Record<string, unknown>[], after: string | null) {
  let prior: Record<string, unknown> | null = after === null ? null : afterRow(section, after);
  for (const entry of entries) {
    if (prior && !ordered(section, prior, entry)) {
      throw new Error('sync_identity_node_fact_page_invalid');
    }
    prior = entry;
  }
}

function parsePage(value: unknown, nodeId: string, section: SyncIdentityNodeFactSection,
  previous: FactPage | null, after: string | null) {
  const row = record(value);
  if (row.node_id !== nodeId || row.section !== section ||
      typeof row.head_id !== 'string' || !row.head_id ||
      !HEX.test(String(row.fact_digest)) ||
      !HEX.test(String(row.requirements_digest)) ||
      !Array.isArray(row.entries) || row.entries.length > 128 ||
      row.nextAfter !== null && typeof row.nextAfter !== 'string' ||
      encoder.encode(JSON.stringify(row)).length > 70000 ||
      previous && (previous.head_id !== row.head_id ||
        previous.fact_digest !== row.fact_digest ||
        previous.requirements_digest !== row.requirements_digest)) {
    throw new Error('sync_identity_node_fact_page_invalid');
  }
  const entries = row.entries.map((entry) => validEntry(section, entry));
  assertEntryOrder(section, entries, after);
  if (row.nextAfter !== null && (!entries.length ||
      row.nextAfter !== cursor(section, entries.at(-1)!))) {
    throw new Error('sync_identity_node_fact_page_invalid');
  }
  return row as unknown as FactPage;
}

/** Read fixed-size pages; total history size does not limit valid node facts. */
export async function loadSyncIdentityNodeFactDescription(nodeId: string,
  read: (section: SyncIdentityNodeFactSection, after: string | null) => Promise<unknown>,
  options: { includeReviews?: boolean } = {}) {
  const pages = new Map<SyncIdentityNodeFactSection, unknown[]>();
  let identity: FactPage | null = null;
  for (const section of SECTIONS) {
    if (section === 'reviews' && options.includeReviews === false) {
      pages.set(section, []);
      continue;
    }
    const facts: unknown[] = [];
    let after: string | null = null;
    for (;;) {
      const page = parsePage(await read(section, after), nodeId, section, identity, after);
      identity = page;
      facts.push(...page.entries);
      if (page.nextAfter === null) break;
      if (page.nextAfter === after) throw new Error('sync_identity_node_fact_page_invalid');
      after = page.nextAfter;
    }
    pages.set(section, facts);
  }
  if (!identity) throw new Error('sync_identity_node_fact_page_invalid');
  return { nodeId, headId: identity.head_id!,
    versions: pages.get('versions') as SyncVersionFact[],
    parents: pages.get('parents') as SyncParentFact[],
    reviews: pages.get('reviews') as SyncIdentityNodeFactDescription['reviews'],
    requirements: pages.get('requirements') as SyncIdentityNodeFactDescription['requirements']
  } satisfies SyncIdentityNodeFactDescription;
}

/** Keep one validated review page in memory while checking the immutable source identity. */
export async function* iterateSyncIdentityReviewFacts(nodeId: string, headId: string,
  read: (section: SyncIdentityNodeFactSection, after: string | null) => Promise<unknown>) {
  let identity: FactPage | null = null;
  let after: string | null = null;
  for (;;) {
    const page = parsePage(await read('reviews', after), nodeId, 'reviews', identity, after);
    if (page.head_id !== headId) throw new Error('sync_identity_node_heads_divergent');
    identity = page;
    for (const entry of page.entries) {
      const row = validEntry('reviews', entry);
      if (row.node_id !== nodeId) throw new Error('sync_identity_node_fact_page_invalid');
      yield row;
    }
    if (page.nextAfter === null) return;
    after = page.nextAfter;
  }
}
