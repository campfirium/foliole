import path from 'node:path';

import { buildDemoGuidesContent } from './demo-guides-content.ts';

const DEFAULT_CONTENT_ROOT = 'docs/i18n/guides';
const DEFAULT_OUTPUT_PATH = 'src/demo/generated/demoPacks.ts';

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`Invalid argument: ${name ?? ''}`);
    flags.set(name.slice(2), value);
    index += 1;
  }
  return {
    contentRoot: flags.get('content-root') ?? DEFAULT_CONTENT_ROOT,
    outputPath: flags.get('output') ?? DEFAULT_OUTPUT_PATH
  };
}

buildDemoGuidesContent(parseArgs(process.argv.slice(2))).then((packs) => {
  const locales = Object.keys(packs).sort().join(', ');
  console.log(`[demo-guides] generated ${path.normalize(DEFAULT_OUTPUT_PATH)} for ${locales}`);
}).catch((error) => {
  console.error(`[demo-guides] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
