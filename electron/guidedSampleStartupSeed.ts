import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRegisteredAppLocale, type RegisteredAppLocale } from '../lib/core/localization/appLocaleRegistry.js';
import { readPrimaryLanguage } from '../lib/core/localization/systemLanguage.js';

import { seedPendingGuidedSample } from './database/guidedSampleLibrarySeed.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { scheduleMirrorSync } from './mirror/mirrorSyncScheduler.js';
import { resolveRendererIndexPath } from './runtimePaths.js';
import { RUNTIME_SYSTEM_LANGUAGE_ENV_KEY } from './runtimeSystemLanguage.js';

const GUIDED_SAMPLE_ASSET_DIRNAME = 'guided-sample-assets';

/** A brand-new library has no language preference yet, so the sample follows the system. */
export function resolveGuidedSampleSeedLocale(env: NodeJS.ProcessEnv = process.env): RegisteredAppLocale {
  const override = env.FOLIOLE_GUIDED_SAMPLE_LOCALE?.trim();
  if (override === 'en-US') return 'en';
  if (override === 'zh-CN') return 'zh-Hans';
  const systemLanguage = env[RUNTIME_SYSTEM_LANGUAGE_ENV_KEY]?.trim();
  return (systemLanguage ? resolveRegisteredAppLocale(readPrimaryLanguage([systemLanguage])) : null) ?? 'en';
}

/** The assets beside the renderer the window loads, then the source copy used by dev runs. */
export function resolveGuidedSampleAssetDirs(runtimeDir: string) {
  return [
    path.join(path.dirname(resolveRendererIndexPath(runtimeDir, fs.existsSync)), GUIDED_SAMPLE_ASSET_DIRNAME),
    path.join(runtimeDir, '..', '..', 'public', GUIDED_SAMPLE_ASSET_DIRNAME)
  ];
}

export async function seedStartupGuidedSample(env: NodeJS.ProcessEnv = process.env) {
  try {
    const seededNodeIds = await seedPendingGuidedSample({
      assetDirs: resolveGuidedSampleAssetDirs(path.dirname(fileURLToPath(import.meta.url))),
      locale: resolveGuidedSampleSeedLocale(env)
    });
    if (seededNodeIds) scheduleMirrorSync(seededNodeIds);
  } catch (error) {
    // The library stays usable without the sample; the pending marker retries on the next start.
    appendMainProcessDiagnosticLog('guided_sample_seed_failed', { error });
  }
}
