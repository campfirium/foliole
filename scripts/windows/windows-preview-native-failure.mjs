const FAILURE_TAIL_LINES = 40;

function tailLines(output, maxLines = FAILURE_TAIL_LINES) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines)
    .join('\n');
}

export function formatPreviewActionFailure(label, result, trustedStatus = {}) {
  const parts = [`${label} failed`, `exitCode=${result.code ?? 'unknown'}`];
  if (trustedStatus.detail) {
    parts.push(`latestStatus="${trustedStatus.detail}"`);
  }
  const tail = tailLines(result.output ?? `${result.stdout ?? ''}${result.stderr ?? ''}`);
  return tail ? `${parts.join(' ')}\nclient output tail:\n${tail}` : parts.join(' ');
}
