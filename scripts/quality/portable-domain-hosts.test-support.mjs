const HOSTS_EXPRESSION = /^\$\{\{ fromJSON\((.+)\) \}\}$/u;
const DOMAIN_BRANCH = /inputs\.domain == '([^']+)' && '([^']+)' \|\| /gu;
const DEFAULT_BRANCH = /'([^']+)'$/u;

// Reads the `domain == X && hosts || ... || defaultHosts` matrix expression.
export function portableDomainHosts(workflow, domain) {
  const include = workflow.jobs['portable-domain-tests'].strategy.matrix.include;
  const expression = include.match(HOSTS_EXPRESSION)?.[1];
  const fallback = expression?.match(DEFAULT_BRANCH)?.[1];
  if (!fallback) throw new Error(`Unexpected portable domain host matrix: ${include}`);
  const branches = Object.fromEntries([...expression.matchAll(DOMAIN_BRANCH)].map((match) => [match[1], match[2]]));
  return JSON.parse(branches[domain] ?? fallback);
}
