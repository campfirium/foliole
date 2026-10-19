import { normalizeRemoteQualitySourceRef } from './remote-quality-target.mjs';

const ALLOWED_SCOPES = new Set(['android', 'desktop', 'full', 'ios', 'shared']);

export function parseRemoteQualityArgs(args) {
  const result = { scope: '', sourceRef: 'refs/heads/dev' };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1] ?? '';
    if (name === '--skip-preflight') {
      result.skipPreflight = true;
      index -= 1;
    } else if (name === '--scope') result.scope = value;
    else if (name === '--replay') result.replay = value;
    else if (name === '--source-ref') result.sourceRef = normalizeRemoteQualitySourceRef(value);
    else throw new Error(`Unknown argument: ${name}`);
  }
  if (result.replay !== undefined) {
    if (!/^[1-9]\d*$/u.test(result.replay)) throw new Error('--replay requires a numeric run ID');
    if (result.scope) throw new Error('--replay and --scope are mutually exclusive');
    result.scope = 'replay';
  } else if (!ALLOWED_SCOPES.has(result.scope)) {
    throw new Error('--scope must be desktop, shared, android, ios, or full');
  }
  return result;
}
