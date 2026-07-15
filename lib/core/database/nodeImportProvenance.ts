export interface NodeImportProvenanceInput {
  importContentFingerprint: string | null | undefined;
  importSourceFingerprint: string | null | undefined;
}

export function normalizeNodeImportProvenance(input: NodeImportProvenanceInput) {
  const hasContent = typeof input.importContentFingerprint === 'string'
    && input.importContentFingerprint.length > 0;
  const hasSource = typeof input.importSourceFingerprint === 'string'
    && input.importSourceFingerprint.length > 0;
  return hasContent && hasSource
    ? {
        importContentFingerprint: input.importContentFingerprint!,
        importSourceFingerprint: input.importSourceFingerprint!
      }
    : { importContentFingerprint: null, importSourceFingerprint: null };
}
