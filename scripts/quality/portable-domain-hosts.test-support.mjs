const HOSTS_EXPRESSION = /^\$\{\{ fromJSON\(inputs\.domain == '([^']+)' && '([^']+)' \|\| '([^']+)'\) \}\}$/u;

export function portableDomainHosts(workflow, domain) {
  const include = workflow.jobs['portable-domain-tests'].strategy.matrix.include;
  const match = include.match(HOSTS_EXPRESSION);
  if (!match) throw new Error(`Unexpected portable domain host matrix: ${include}`);
  return JSON.parse(domain === match[1] ? match[2] : match[3]);
}
