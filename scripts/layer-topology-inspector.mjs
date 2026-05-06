import path from 'node:path';

import { HOST_ISOLATION_RULES, resolveTopologyUnit } from './layer-topology-rules.mjs';

export function resolveInternalImport(relativeFile, source) {
  const normalizedSource = source.replace(/\\/g, '/');
  if (normalizedSource.startsWith('@/')) {
    return path.posix.normalize(`src/${normalizedSource.slice(2)}`);
  }
  if (/^(?:electron|android|ios|lib|src)\//.test(normalizedSource)) {
    return normalizedSource;
  }
  if (!normalizedSource.startsWith('.')) {
    return null;
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(relativeFile), normalizedSource));
}

export function inspectHostIsolation(relativeFile, contents, { referencePattern, toLineNumber }) {
  const unit = resolveTopologyUnit(relativeFile);
  if (!unit) return [];
  const rules = HOST_ISOLATION_RULES.filter((rule) => rule.from.includes(unit.id));
  if (rules.length === 0) return [];
  const violations = [];
  for (const match of contents.matchAll(referencePattern)) {
    const target = resolveInternalImport(relativeFile, match[2] ?? '');
    if (!target) continue;
    const rule = rules.find((candidate) => candidate.forbiddenPrefixes.some((prefix) => target.startsWith(prefix)));
    if (rule) {
      violations.push({ file: relativeFile, line: toLineNumber(contents, match.index ?? 0), kind: rule.kind });
    }
  }
  return violations;
}
