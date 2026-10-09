import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function failureKind(message) {
  if (/Failed to install (?:the )?app|Could not install (?:the )?app/iu.test(message)) return 'app-install';
  if (/CodeSign failed|Signing .+ requires a development team|Provisioning profile .+doesn't/iu.test(message)) return 'signing';
  if (/Timed out while enabling automation mode|failed to initialize for UI testing/iu.test(message)) {
    return 'automation-startup';
  }
  if (/refused channel request.*XCTest|Lost connection to.*testmanager|connection.*(?:interrupted|invalidated).*XCTest/iu.test(message)) {
    return 'automation-channel';
  }
  return 'test-failure';
}

function logFacts(log) {
  const methodsStarted = [];
  const failures = [];
  const attempts = new Map();
  const sessions = new Map();
  for (const [index, line] of log.split(/\r?\n/u).entries()) {
    const runner = line.match(/\b([\w]+)-Runner\[.*Running tests/iu);
    if (runner) sessions.set(runner[1], (sessions.get(runner[1]) ?? 0) + 1);
    const method = line.match(/Test Case '-\[([^ .]+)\.([^ ]+) ([^\]]+)\]' started/u);
    if (method) {
      const identifier = `${method[1]}/${method[2]}/${method[3]}`;
      const attempt = (attempts.get(identifier) ?? 0) + 1;
      attempts.set(identifier, attempt);
      methodsStarted.push({ identifier, attempt, line: index + 1 });
    }
    const kind = failureKind(line);
    if (kind === 'test-failure') continue;
    const target = line.match(/\b([\w]+)-Runner\[/u)?.[1] ?? null;
    failures.push({ kind, message: line.trim(), source: 'log', line: index + 1,
      target, attempt: target ? sessions.get(target) ?? null : null });
  }
  return { methodsStarted, failures };
}

export function diagnoseFriXCTest({ log = '', summary = null, action = 'test',
  xcodeStatus = -1, keepStatus = -1, summaryStatus = -1, attachmentsStatus = -1 } = {}) {
  const facts = logFacts(log);
  const summaryFailures = Array.isArray(summary?.testFailures) ? summary.testFailures : [];
  const failures = summaryFailures.filter((failure) => failure && typeof failure === 'object').map((failure) => ({
    kind: failureKind(failure.failureText ?? ''), message: failure.failureText ?? '',
    source: 'summary', target: failure.targetName ?? null,
    identifier: failure.testIdentifierString ?? null, attempt: null
  }));
  failures.push(...facts.failures);
  if (keepStatus > 0) failures.push({ kind: 'foreground-restore', source: 'status', message: `exit ${keepStatus}` });
  if (summaryStatus > 0) failures.push({ kind: 'evidence-summary', source: 'status', message: `exit ${summaryStatus}` });
  if (attachmentsStatus > 0) failures.push({ kind: 'evidence-attachments', source: 'status', message: `exit ${attachmentsStatus}` });
  if (xcodeStatus > 0 && failures.length === 0) {
    failures.push({ kind: action === 'build-for-testing' ? 'build-command' : 'unknown',
      source: 'status', message: `Xcode exit ${xcodeStatus}` });
  }
  return { methodsStarted: facts.methodsStarted, failures,
    evidence: { logAvailable: Boolean(log), summaryAvailable: Boolean(summary),
      summaryStatus, attachmentsStatus },
    statuses: { action, xcodeStatus, keepStatus } };
}

function readText(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

export function inspectFriXCTest({ logPath, summaryPath, resultPath, ...statuses }) {
  let summary = null;
  const saved = readText(summaryPath);
  if (saved) {
    try { summary = JSON.parse(saved); } catch { /* Keep the original command failure. */ }
  } else if (resultPath && existsSync(resultPath)) {
    const result = spawnSync('xcrun', ['xcresulttool', 'get', 'test-results', 'summary',
      '--path', resultPath], { encoding: 'utf8', timeout: 10_000 });
    if (result.status === 0) {
      try { summary = JSON.parse(result.stdout); } catch { /* Report unavailable evidence. */ }
    }
  }
  return diagnoseFriXCTest({ ...statuses, log: readText(logPath), summary });
}

export function currentFriDiagnosis(output = '') {
  const starts = [];
  const completions = [];
  for (const line of output.split(/\r?\n/u)) {
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (record?.event === 'fri-run-started') starts.push(record);
    if (record?.event === 'fri-run-completed') completions.push(record);
  }
  if (starts.length !== 1 || completions.length !== 1) return null;
  const start = starts[0];
  const completed = completions[0];
  if (typeof start.invocationId !== 'string' || !start.invocationId ||
      start.invocationId !== completed.invocationId ||
      !Array.isArray(completed.diagnosis?.failures) ||
      !Array.isArray(completed.diagnosis?.methodsStarted)) return null;
  return completed;
}

export function describeFriFailure(result = {}, label = 'Fri XCTest') {
  const output = result.output ?? `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const current = currentFriDiagnosis(output);
  const interrupted = result.terminationReason || result.childSignal || result.signal;
  const rawLog = output.split(/\r?\n/u).filter((line) => {
    try { JSON.parse(line); return false; } catch { return true; }
  }).join('\n');
  const diagnosis = current?.diagnosis ?? diagnoseFriXCTest({ log: rawLog });
  const kinds = [...new Set(diagnosis.failures.map(({ kind }) => kind))];
  const observed = kinds.join(', ') || 'unknown';
  const reason = interrupted ? `interrupted (${interrupted}); observed=${observed}` : observed;
  const detail = diagnosis.failures[0]?.message;
  const evidence = current?.promoted ? ` Evidence: ${current.promoted}.` : '';
  return { diagnosis, diagnosticComplete: Boolean(current), invocationId: current?.invocationId ?? null,
    evidenceRoot: current?.promoted ?? null, terminationReason: interrupted ?? null,
    message: `${label} failed: ${reason}; exit=${result.code ?? result.status ?? 'unknown'}.` +
      (detail ? ` ${String(detail).slice(0, 240)}` : '') + evidence };
}
