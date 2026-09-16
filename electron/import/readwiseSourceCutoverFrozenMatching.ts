import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import {
  freezeReadwiseSourceCutoverLegacyMatches,
  requireReadwiseSourceCutoverV2
} from './readwiseSourceCutoverJournal.js';
import { groupReadwiseSourceArtifacts } from './readwiseSourceCutoverMatching.js';

interface CurrentMatching {
  artifactFor: (documentId: string) => ReadwiseSourceArtifact | null;
  failures: Array<{ nodeId: string; reason: string }>;
}

export function freezeReadwiseSourceCutoverMatching(input: {
  artifacts: ReadwiseSourceArtifact[];
  documents: PreparedReadwiseApiDocument[];
  matching: CurrentMatching;
}) {
  const current = requireReadwiseSourceCutoverV2();
  if (current.legacyMatches === undefined) {
    const matches = collectMatches(input.documents, input.matching, current.documents);
    const failedNodeIds = new Set((current.unmatchedLegacy ?? input.matching.failures)
      .map((item) => item.nodeId));
    freezeReadwiseSourceCutoverLegacyMatches({
      matches,
      total: new Set([...matches.map((item) => item.nodeId), ...failedNodeIds]).size
    });
  }
  const frozen = requireReadwiseSourceCutoverV2();
  const artifactsByNode = new Map(groupReadwiseSourceArtifacts(input.artifacts)
    .map((artifact) => [artifact.latestNodeId, artifact]));
  const nodeByRemote = new Map((frozen.legacyMatches ?? [])
    .map((item) => [item.remoteId, item.nodeId]));
  return {
    artifactFor(documentId: string) {
      const nodeId = nodeByRemote.get(documentId);
      return nodeId ? artifactsByNode.get(nodeId) ?? null : null;
    },
    failures: frozen.unmatchedLegacy ?? input.matching.failures,
    legacyTotal: frozen.legacyTotal ?? 0,
    matchedDocumentIds: new Set(nodeByRemote.keys())
  };
}

function collectMatches(
  documents: PreparedReadwiseApiDocument[],
  matching: CurrentMatching,
  terminals: ReturnType<typeof requireReadwiseSourceCutoverV2>['documents']
) {
  const byRemote = new Map<string, { nodeId: string; remoteId: string }>();
  for (const document of documents) {
    const artifact = matching.artifactFor(document.id);
    if (artifact) byRemote.set(document.id, { nodeId: artifact.latestNodeId, remoteId: document.id });
  }
  for (const terminal of terminals) {
    if (terminal.nodeId && !byRemote.has(terminal.remoteId)) {
      byRemote.set(terminal.remoteId, { nodeId: terminal.nodeId, remoteId: terminal.remoteId });
    }
  }
  const claimedNodes = new Set<string>();
  return [...byRemote.values()].filter((item) => {
    if (claimedNodes.has(item.nodeId)) return false;
    claimedNodes.add(item.nodeId);
    return true;
  });
}
