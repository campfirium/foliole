import type { DbPort } from './dbPort.js';
import { planNodeVersionChain,
  type ChainEdge, type ChainVersion } from './nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, CHAIN_VERSIONS_SQL,
  chainReferencesQuery, qualifyNodeVersionReadSql } from './nodeVersionChainSql.js';
import { describeVersionFact } from './syncPackFactPresence.js';

export type RequiredFactVersion = ChainVersion & {
  host_name: string; created_at: string; content_hash: string;
};

/** Compare the facts demanded by the same protected IDs, not raw retained history. */
export function projectSyncIdentityRequiredFacts(args: {
  edges: ChainEdge[];
  frozenIds?: Set<string>;
  protectedIds: Set<string>;
  versions: RequiredFactVersion[];
}) {
  const plan = planNodeVersionChain(args.versions, args.edges, args.protectedIds,
    args.frozenIds ?? new Set<string>(), Number.MAX_SAFE_INTEGER);
  if (plan.skipped || !plan.removed || !plan.relations) {
    throw new Error(`sync_identity_fact_projection_${plan.skipped ?? 'incomplete'}`);
  }
  const requiredBodies = new Set(plan.requiredBodyIds);
  const kept = args.versions.filter((row) => requiredBodies.has(row.version_id));
  const parents = new Map(plan.relations.map((row) => [row.id, row.parents]));
  const closure = (versionId: string): string[] => {
    const seen = new Set<string>();
    const visit = (id: string) => {
      for (const parent of parents.get(id) ?? []) {
        if (!seen.has(parent)) {
          seen.add(parent);
          visit(parent);
        }
      }
    };
    visit(versionId);
    return [...seen].filter((id) => requiredBodies.has(id)).sort();
  };
  return kept.map((row) => {
    const { parent_version_id: _mutableParent, ...immutable } = describeVersionFact(row);
    void _mutableParent;
    return { version: immutable, ancestors: closure(row.version_id) };
  }).sort((a, b) => a.version.version_id.localeCompare(b.version.version_id));
}

/** Read the same current and local protection obligations used by retention. */
export async function readSyncIdentityRetentionRequirements(port: DbPort, nodeId: string,
  schema = 'main') {
  const [head] = await port.query<{ current_version_id: string | null }>(
    qualifyNodeVersionReadSql(CHAIN_HEAD_SQL, schema), [nodeId]);
  const references = chainReferencesQuery(nodeId, false, schema);
  const refs = await port.query<{ version_id: string | null; frozen: number }>(
    references.sql, references.params);
  const protectedIds = new Set([
    ...(head?.current_version_id ? [head.current_version_id] : []),
    ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
  const frozenIds = new Set(refs.filter((row) => row.frozen && row.version_id)
    .map((row) => row.version_id!));
  return { headId: head?.current_version_id ?? null,
    protectedIds: [...protectedIds].sort(), frozenIds: [...frozenIds].sort() };
}

export async function readSyncIdentityRequiredFacts(port: DbPort, nodeId: string,
  schema = 'main') {
  const requirements = await readSyncIdentityRetentionRequirements(port, nodeId, schema);
  if (!requirements.headId) return null;
  return { headId: requirements.headId, protectedIds: requirements.protectedIds,
    facts: projectSyncIdentityRequiredFacts({
      versions: await port.query<RequiredFactVersion>(
        qualifyNodeVersionReadSql(CHAIN_VERSIONS_SQL, schema), [nodeId]),
      edges: await port.query<ChainEdge>(
        qualifyNodeVersionReadSql(CHAIN_EDGES_SQL, schema), [nodeId]),
      protectedIds: new Set(requirements.protectedIds),
      frozenIds: new Set(requirements.frozenIds)
    }) };
}
