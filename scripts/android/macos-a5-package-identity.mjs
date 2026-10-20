import fs from 'node:fs';
import path from 'node:path';

export function recordA5PackageIdentity({ captured, context, env, paths }) {
  const analyzer = path.join(env.ANDROID_SDK_ROOT, 'cmdline-tools/latest/bin/apkanalyzer');
  const read = (args) => captured(analyzer, [...args, paths.apk], { env });
  const applicationId = read(['manifest', 'application-id']);
  const value = (name) => read(['resources', 'value', '--config', 'default',
    '--type', 'string', '--name', name]);
  const displayName = value('app_name');
  const activityDisplayName = value('title_activity_main');
  if (!displayName || displayName !== activityDisplayName) {
    throw new Error('Android application and activity display names must match.');
  }
  const identity = { applicationId, displayName, activityDisplayName };
  const evidencePath = path.join(context.artifactsRoot, 'a5-package-identity', `${context.runId}.json`);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify({ ...identity, action: context.action,
    runId: context.runId, apk: paths.apk }, null, 2)}\n`);
  return identity;
}
