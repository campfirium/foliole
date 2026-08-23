import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';

export function parseWindowsDevLiveEvidence(output) {
  const match = /^\[windows-dev-action\] live identity=([A-Za-z0-9.-]{1,96}) screenshot=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV live action did not report screenshot evidence');
  const normalized = match[2].replaceAll('\\', '/');
  const expected = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}/a5-live.png`;
  if (normalized !== expected) throw new Error('Windows DEV live screenshot path escaped its fixed evidence root');
  return { buildIdentity: match[1], remotePath: normalized };
}

export function parseWindowsDevCaptureAnnotationEvidence(output) {
  const match = /^\[windows-dev-action\] capture-annotation identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV capture-annotation action did not report fixed evidence');
  const remoteRoot = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/capture-annotation-manifest.json`) {
    throw new Error('Windows DEV capture-annotation manifest escaped its fixed evidence root');
  }
  return { buildIdentity: match[1], remoteRoot };
}

export function parseWindowsDevStatusEvidence(output, expectedStatus) {
  const match = /^\[windows-dev-action\] status: (OK|FAILED) exit=\d+ evidence=([^\r\n]+)$/mu.exec(output);
  if (!match || match[1] !== expectedStatus) {
    throw new Error(`Windows DEV action did not report fixed ${expectedStatus.toLowerCase()} evidence`);
  }
  const normalized = match[2].replaceAll('\\', '/');
  const suffix = '/summary.json';
  const buildIdentity = normalized.slice(WINDOWS_DEV_EVIDENCE_PREFIX.length, -suffix.length);
  if (!normalized.startsWith(WINDOWS_DEV_EVIDENCE_PREFIX) || !normalized.endsWith(suffix)
      || !/^[A-Za-z0-9.-]{1,96}$/u.test(buildIdentity)) {
    throw new Error(`Windows DEV ${expectedStatus.toLowerCase()} evidence escaped its fixed root`);
  }
  return { buildIdentity, remoteRoot: normalized.slice(0, -suffix.length) };
}

export const parseWindowsDevFailureEvidence = (output) => parseWindowsDevStatusEvidence(output, 'FAILED');
export const parseWindowsDevSuccessEvidence = (output) => parseWindowsDevStatusEvidence(output, 'OK');
