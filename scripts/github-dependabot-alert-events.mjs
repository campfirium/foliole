import { recordMonitorError, runGh } from './github-monitor-gh.mjs';

function flattenPages(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((page) => Array.isArray(page) ? page : [page]);
}

function alertLine(alert) {
  const dependency = alert.dependency ?? {};
  const vulnerability = alert.security_vulnerability ?? {};
  return [
    `#${alert.number}`,
    vulnerability.severity ?? alert.security_advisory?.severity ?? 'unknown',
    dependency.package?.name ?? vulnerability.package?.name ?? 'unknown',
    dependency.scope ?? 'unknown',
    dependency.manifest_path ?? 'unknown',
    vulnerability.first_patched_version?.identifier ?? 'unavailable',
    alert.html_url ?? ''
  ].join(' | ');
}

function buildAlertEvent(config, alerts, renderTemplate) {
  const ordered = [...alerts].sort((left, right) => Number(left.number) - Number(right.number));
  const alertNumbers = ordered.map((alert) => String(alert.number));
  const eventId = alertNumbers.join('-');
  const highCount = ordered.filter((alert) => (
    alert.security_vulnerability?.severity ?? alert.security_advisory?.severity
  ) === 'high').length;
  const data = {
    alertCount: String(ordered.length),
    alertNumbers: alertNumbers.join(', '),
    alerts: ordered.map(alertLine).join('\n'),
    eventId,
    highCount: String(highCount),
    repository: config.repository,
    source: 'foliole/dependabot-alerts',
    workspace: config.workspace
  };
  const prompt = renderTemplate(config.template, data);
  if (prompt.length > (config.maxPromptChars ?? 12000)) {
    throw new Error(`Dependabot alert prompt exceeds ${config.maxPromptChars ?? 12000} characters`);
  }
  return {
    ...data,
    alertNumbers,
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', eventId),
    prompt,
    reconcileOpen: true,
    title: `Foliole Dependabot health: ${ordered.length} open alert${ordered.length === 1 ? '' : 's'}`,
    ttlSeconds: config.defaultTtlSeconds
  };
}

export function listDependabotAlertEvents(config, state, errors, renderTemplate) {
  if (!config?.enabled) return [];
  let alerts;
  try {
    alerts = flattenPages(runGh([
      'api',
      '--paginate',
      '--slurp',
      `repos/${config.repository}/dependabot/alerts?state=open&per_page=100`
    ]));
  } catch (error) {
    recordMonitorError(errors, 'github-dependabot-alerts', 'list', error);
    return [];
  }
  if (!alerts.length) return [];
  try {
    return [buildAlertEvent(config, alerts, renderTemplate)];
  } catch (error) {
    recordMonitorError(errors, 'github-dependabot-alerts', 'render', error);
    return [];
  }
}
