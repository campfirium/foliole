import fs from 'node:fs';
import path from 'node:path';

/* global process */

const ACTION = 'desktop-dnssd-host-facts';

export async function runWindowsDesktopDnsSdHostFacts(action, execute, paths, evidenceRoot) {
  if (action !== ACTION) return null;
  const script = path.join(paths.repoRoot, 'scripts', 'windows',
    'windows-desktop-dnssd-host-facts.ps1');
  const result = await execute('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RepoRoot', paths.repoRoot, '-SessionProcessId', String(process.pid)
  ], { timeoutCode: 'desktop_dnssd_host_facts_timeout', timeoutMs: 30_000,
    windowsHide: true });
  if (result.code !== 0) {
    throw Object.assign(new Error(result.stderr || 'Windows DNS-SD host facts failed'), {
      exitCode: 74, result, stage: 'desktop-dnssd-host-facts'
    });
  }
  let facts;
  try { facts = JSON.parse(result.stdout.replace(/^\uFEFF/u, '').trim()); }
  catch {
    throw Object.assign(new Error('Windows DNS-SD host facts are not valid JSON'), {
      exitCode: 74, result, stage: 'desktop-dnssd-host-facts'
    });
  }
  const manifestPath = path.join(evidenceRoot, 'desktop-dnssd-host-facts.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
  return { evidence: facts, manifestPath, output: '' };
}
