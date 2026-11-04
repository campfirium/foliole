import { normalizeRemoteQualitySourceRef } from './remote-quality-target.mjs';

const ALLOWED_SCOPES = new Set(['android', 'desktop', 'full', 'ios', 'shared']);
const PREFLIGHT_HOSTS = new Set(['mac', 'windows']);

export function parseRemoteQualityArgs(args) {
  const result = { scope: '', sourceRef: 'refs/heads/dev' };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1] ?? '';
    if (name === '--skip-preflight') {
      result.skipPreflight = true;
      index -= 1;
    } else if (name === '--scope') result.scope = value;
    else if (name === '--mobile-distribution') result.mobileDistribution = value;
    else if (name === '--reuse-mobile-quality') result.mobileQualityRunId = value;
    else if (name === '--replay') result.replay = value;
    else if (name === '--preflight-host') result.preflightHost = value;
    else if (name === '--source-ref') result.sourceRef = normalizeRemoteQualitySourceRef(value);
    else throw new Error(`Unknown argument: ${name}`);
  }
  if (result.preflightHost !== undefined) {
    if (!PREFLIGHT_HOSTS.has(result.preflightHost)) throw new Error('--preflight-host must be mac or windows');
    if (result.skipPreflight || result.replay !== undefined) {
      throw new Error('--preflight-host cannot be combined with --skip-preflight or --replay');
    }
  }
  if (result.replay !== undefined) {
    if (!/^[1-9]\d*$/u.test(result.replay)) throw new Error('--replay requires a numeric run ID');
    if (result.scope) throw new Error('--replay and --scope are mutually exclusive');
    result.scope = 'replay';
  } else if (!ALLOWED_SCOPES.has(result.scope)) {
    throw new Error('--scope must be desktop, shared, android, ios, or full');
  }
  if (result.mobileDistribution !== undefined) {
    if (!['ios', 'android'].includes(result.mobileDistribution)) throw new Error('--mobile-distribution supports ios or android');
    if (result.scope !== 'full' || result.skipPreflight) {
      throw new Error('Mobile distribution requires full quality without a preflight bypass');
    }
  }
  if (result.mobileQualityRunId !== undefined &&
      (!/^[1-9]\d*$/u.test(result.mobileQualityRunId) || result.mobileDistribution !== 'ios' || result.scope !== 'full')) {
    throw new Error('--reuse-mobile-quality requires an original full mobile QA run and ios distribution');
  }
  return result;
}
