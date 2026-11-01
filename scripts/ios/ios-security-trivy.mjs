/* global fetch, AbortSignal */
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { digest } from '../security/security-inputs.mjs';

const RELEASE = 'https://github.com/aquasecurity/trivy/releases/download/v0.76.1/';
export const TRIVY_DISTRIBUTIONS = {
  'darwin-arm64': { file: 'trivy_0.76.1_macOS-ARM64.tar.gz',
    sha256: '11a9b6cd2752011b54f01ea4bd0dbfa9f0c41dc6538d5a3f9d23955f471bf4e5' },
  'linux-x64': { file: 'trivy_0.76.1_Linux-64bit.tar.gz',
    sha256: 'c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0' }
};

export async function ensureIosTrivy({ root, fetchSource = fetch }) {
  const distribution = TRIVY_DISTRIBUTIONS[`${process.platform}-${process.arch}`];
  if (!distribution) throw new Error('No qualified Trivy distribution for this host; provide FOLIOLE_TRIVY_BIN');
  const directory = path.join(root, '.cache/ios-security-tools/0.76.1');
  mkdirSync(directory, { recursive: true });
  const archive = path.join(directory, distribution.file);
  if (!existsSync(archive)) {
    const response = await fetchSource(`${RELEASE}${distribution.file}`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Trivy release HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    verifyTrivyArchive(data, distribution.sha256);
    writeFileSync(archive, data);
  }
  verifyTrivyArchive(readFileSync(archive), distribution.sha256);
  execFileSync('tar', ['-xzf', archive, '-C', directory, 'trivy']);
  const binary = path.join(directory, 'trivy');
  chmodSync(binary, 0o755);
  return binary;
}

export function verifyTrivyArchive(data, expected) {
  if (digest(data) !== expected) throw new Error('Trivy archive SHA-256 mismatch');
}
