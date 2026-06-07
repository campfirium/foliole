#!/usr/bin/env node
/* global console, process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAYERS = {
  activity: 'activity_reporting',
  content: 'content_metadata',
  cursor: 'cursor',
  desktop: 'desktop_diagnostics',
  devicePrivate: 'device_private_state',
  localPush: 'local_push_blocker',
  resource: 'resource_bytes',
  structure: 'structure',
  converged: 'converged',
  partial: 'partial'
};

function parseArgs(argv) {
  const options = { androidAuditPath: null, desktopDiagnosticsPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--desktop-diagnostics-json' && value) {
      options.desktopDiagnosticsPath = path.resolve(value);
      index += 1;
    } else if (key === '--android-audit-json' && value) {
      options.androidAuditPath = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${key ?? '<empty>'}`);
    }
  }
  if (!options.desktopDiagnosticsPath && !options.androidAuditPath) {
    throw new Error('provide --desktop-diagnostics-json, --android-audit-json, or both');
  }
  return options;
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function addEvidence(evidence, layer, severity, message, details = {}) {
  evidence.push({ details, layer, message, severity });
}

function desktopErrors(desktop) {
  return [
    ...(desktop?.verdicts ?? []),
    ...(desktop?.desktop?.verdicts ?? [])
  ].filter((verdict) => verdict?.severity === 'error');
}

function hasStructuralGap(android) {
  return (android?.structural ?? []).some(
    (item) => (item.missingOnAndroid?.length ?? 0) > 0 || (item.positionMismatches?.length ?? 0) > 0
  );
}

function hasDevicePrivateLeak(android) {
  const policy = android?.statePolicy?.devicePrivate ?? {};
  return (policy.nonLocalNodeViewStateRows ?? 0) > 0 || (policy.nonLocalNodeReadingDeviceStateRows ?? 0) > 0;
}

function hasResourceBytesGap(android) {
  const resources = android?.resources ?? {};
  return (resources.availableWithoutData?.length ?? 0) > 0 ||
    (resources.missingReferencedContentBlobs ?? 0) > 0 ||
    (resources.missingAttachmentResources ?? 0) > 0 ||
    (resources.missingNodeBodies ?? 0) > 0 ||
    (resources.missingExternalDocumentBodies ?? 0) > 0;
}

function hasActivityIssue(android) {
  const run = android?.syncEvents?.latestRun;
  return run && run.result && !['completed', 'skipped'].includes(run.result);
}

function collectEvidence(input) {
  const evidence = [];
  const { androidAudit: android, desktopDiagnostics: desktop } = input;
  if (!desktop) addEvidence(evidence, LAYERS.partial, 'warning', 'desktop diagnostics input is missing');
  if (!android) addEvidence(evidence, LAYERS.partial, 'warning', 'Android audit input is missing');

  for (const verdict of desktopErrors(desktop)) {
    addEvidence(evidence, LAYERS.desktop, 'error', verdict.message ?? verdict.code, { code: verdict.code });
  }
  if ((android?.localPush?.issueCount ?? 0) > 0 || (android?.localPush?.dirtyCount ?? 0) > 0) {
    addEvidence(evidence, LAYERS.localPush, 'error', 'Android has unsent or blocked local changes', android.localPush);
  }
  if ((android?.cursors?.gap ?? 0) < 0 || android?.suspectedBrokenLayer?.startsWith('cursor advancement')) {
    addEvidence(evidence, LAYERS.cursor, 'error', 'Android cursor is ahead of desktop', android?.cursors ?? {});
  }
  if (hasStructuralGap(android)) {
    addEvidence(evidence, LAYERS.structure, 'error', 'Android structure differs from desktop', {
      structural: android.structural
    });
  }
  if (hasDevicePrivateLeak(android)) {
    addEvidence(evidence, LAYERS.devicePrivate, 'warning', 'Android contains non-local device-private state rows', {
      devicePrivate: android.statePolicy.devicePrivate
    });
  }
  if ((android?.content?.missingMetadata?.length ?? 0) > 0) {
    addEvidence(evidence, LAYERS.content, 'warning', 'Android is missing content blob metadata', android.content);
  }
  if (hasResourceBytesGap(android)) {
    addEvidence(evidence, LAYERS.resource, 'warning', 'Android is missing referenced resource bytes', android.resources);
  }
  if (hasActivityIssue(android)) {
    addEvidence(evidence, LAYERS.activity, 'warning', 'Latest Android sync run did not finish cleanly', android.syncEvents.latestRun);
  }
  return evidence;
}

function selectPrimaryLayer(evidence, hasBothInputs) {
  if (!hasBothInputs) return LAYERS.partial;
  const priority = [
    LAYERS.desktop,
    LAYERS.localPush,
    LAYERS.cursor,
    LAYERS.structure,
    LAYERS.devicePrivate,
    LAYERS.content,
    LAYERS.resource,
    LAYERS.activity
  ];
  return priority.find((layer) => evidence.some((item) => item.layer === layer)) ?? LAYERS.converged;
}

function statusFor(primaryLayer, evidence, hasBothInputs) {
  if (!hasBothInputs) return 'partial';
  if (primaryLayer === LAYERS.converged) return 'converged';
  return evidence.some((item) => item.severity === 'error') ? 'degraded' : 'warning';
}

function buildSyncConvergenceHealthReport(input) {
  const hasBothInputs = Boolean(input.desktopDiagnostics && input.androidAudit);
  const evidence = collectEvidence(input);
  const primaryLayer = selectPrimaryLayer(evidence, hasBothInputs);
  return {
    evidence,
    primaryLayer,
    status: statusFor(primaryLayer, evidence, hasBothInputs),
    summary: summaryFor(primaryLayer, hasBothInputs)
  };
}

function summaryFor(primaryLayer, hasBothInputs) {
  if (!hasBothInputs) return 'Only partial sync diagnostics are available.';
  if (primaryLayer === LAYERS.converged) return 'Desktop and Android sync diagnostics show no obvious convergence gap.';
  return `Sync convergence is blocked or degraded at ${primaryLayer}.`;
}

function formatSyncConvergenceHealthReport(report) {
  const lines = [
    '=== Sync Convergence Health ===',
    `status        : ${report.status}`,
    `primary_layer : ${report.primaryLayer}`,
    `summary       : ${report.summary}`,
    '',
    '=== Evidence ==='
  ];
  if (report.evidence.length === 0) {
    lines.push('none');
    return lines.join('\n');
  }
  for (const item of report.evidence) {
    lines.push(`- [${item.severity}] ${item.layer}: ${item.message}`);
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const desktopDiagnostics = options.desktopDiagnosticsPath ? await readJsonFile(options.desktopDiagnosticsPath) : null;
  const androidAudit = options.androidAuditPath ? await readJsonFile(options.androidAuditPath) : null;
  console.log(formatSyncConvergenceHealthReport(buildSyncConvergenceHealthReport({
    androidAudit,
    desktopDiagnostics
  })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[sync-convergence-health-report] FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export {
  buildSyncConvergenceHealthReport,
  formatSyncConvergenceHealthReport,
  parseArgs
};
