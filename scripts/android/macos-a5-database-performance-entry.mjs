/* global console, process */

import path from 'node:path';

export async function runMacosA5DatabasePerformanceEntry(args) {
  args.assertFixed(); args.build();
  const buildIdentity = args.buildIdentity();
  args.markMutationBoundary?.();
  const { runA5DatabasePerformance } = await import(
    './android-a5-database-performance-action.mjs'
  );
  const result = await runA5DatabasePerformance({ env: args.env,
    evidenceRoot: path.join(
      args.paths.artifactsRoot, 'companion-database-performance', buildIdentity
    ),
    execute: args.execute, paths: args.paths, serial: args.serial });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] database-performance evidence=${result.evidencePath}`);
}
