export interface JpegBodyRepairCandidate {
  bodyHash: string | null;
  currentVersionId: string | null;
  jpegKeys: string[];
  nextContent: string;
  nodeId: string;
  previousContent: string;
  updatedAt: string;
}

export interface JpegBodyRepairPlan {
  candidates: JpegBodyRepairCandidate[];
  generatedAt: string;
  planHash: string;
  syncGroupDigest: string;
  tokenCount: number;
}

export interface JpegBodyRepairInvariants {
  assetsDigest: string;
  attachmentFactsDigest: string;
  nonTargetNodesDigest: string;
  syncGroupDigest: string;
  targetProtectedDigest: string;
}
