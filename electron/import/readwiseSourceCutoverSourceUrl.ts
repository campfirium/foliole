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
