import { Buffer } from 'node:buffer';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { resolveRuntimeDataPaths } from '../../electron/database/runtimeDataPaths.js';

import { hostedAttachments } from './ios-hosted-request-seed-data.js';

/** Prepare only the isolated fixture's existing resource keys in its real resource-owner directory. */
export async function prepareIosHostedRequestResources(databasePath: string): Promise<void> {
  await runWithDatabaseConnectionOwner(async () => {
    const home = process.env.FOLIOLE_LIBRARY_HOME;
    const relative = home ? path.relative(path.resolve(home), path.resolve(databasePath)) : '..';
    const paths = resolveRuntimeDataPaths();
    if (!home || relative.startsWith('..') || path.isAbsolute(relative) || paths.databasePath !== databasePath) {
      throw new Error('ios_hosted_request_library_mismatch');
    }
    await mkdir(paths.assetsDir, { recursive: true });
    await writeFile(path.join(paths.assetsDir, `${hostedAttachments.valid.hash}.pdf`),
      Buffer.from(hostedAttachments.valid.base64, 'base64'));
    await writeFile(path.join(paths.assetsDir, `${hostedAttachments.corrupt.hash}.png`), 'corrupt-delivery');
    // The former 503 case now asserts unavailable bytes; request transport failure/retry has separate coverage.
    for (const name of ['missing', 'failed'] as const) {
      await rm(path.join(paths.assetsDir, `${hostedAttachments[name].hash}.png`), { force: true });
    }
  });
}
