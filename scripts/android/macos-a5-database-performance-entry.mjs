/* global console, process */

import path from 'node:path';
import { buildA5DatabasePerformance } from './a5-database-performance-build.mjs';

export async function runMacosA5DatabasePerformanceEntry(args) {
  buildA5DatabasePerformance(args);
  args.assertFixed();
  const buildIdentity = args.buildIdentity();
  args.markMutationBoundary?.();
  const { runA5DatabasePerformance } = await import(
    './android-a5-database-performance-action.mjs'
  );
  const result = await runA5DatabasePerformance({ env: args.env,
    evidenceRoot: path.join(
      args.paths.artifactsRoot, 'companion-database-performance', buildIdentity
    ),
    execute: args.execute, captured: args.captured, paths: args.paths, serial: args.serial });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] database-performance evidence=${result.evidencePath}`);
}
