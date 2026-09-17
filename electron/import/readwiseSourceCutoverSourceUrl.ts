export function extractReadwiseSourceUrl(value: string) {
  const explicit = /^(?:url|source(?: url)?|original url)\s*:\s*(https?:\/\/\S+)\s*$/imu.exec(value)?.[1];
  const linked = /\[(?:source|original|访问话题)\]\((https?:\/\/[^)]+)\)/iu.exec(value)?.[1];
  const candidate = explicit ?? linked;
  if (!candidate) return null;
  try {
    const url = new URL(candidate.replace(/[),.;]+$/u, ''));
    return url.toString();
  } catch {
    return null;
  }
}

export function extractReadwiseNumericDocumentId(value: string | null | undefined) {
  if (!value) return null;
  const rawContent = /readwise\.io\/reader\/document_raw_content\/(\d+)/iu.exec(value)?.[1];
  const parsedDocument = /(?:^|\/)ParsedDocument(\d+)(?:[./?]|$)/iu.exec(value)?.[1];
  return rawContent ?? parsedDocument ?? null;
}
