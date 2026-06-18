import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DemoPack } from '../../src/demo/demoPack.js';

export async function writeDemoPack(outputPath: string, pack: DemoPack) {
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.tmp`;
  await writeFile(tempPath, `import type { DemoPack } from '../demoPack';\n\nexport const GENERATED_DEMO_PACK: DemoPack = ${JSON.stringify(pack, null, 2)};\n`, 'utf8');
  await rename(tempPath, resolved);
}
