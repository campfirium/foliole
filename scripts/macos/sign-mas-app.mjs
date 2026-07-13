import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CODEX_IDENTIFIER = 'com.campfirium.foliole.codex';
const CODEX_ENTITLEMENTS = fileURLToPath(
  new URL('../../build/entitlements.mas.tool.plist', import.meta.url)
);

export function createMasSignOptions(options) {
  const codexPath = path.join(options.app, 'Contents', 'MacOS', 'codex');
  const optionsForFile = options.optionsForFile;
  return {
    ...options,
    optionsForFile(filePath) {
      const fileOptions = optionsForFile(filePath);
      if (path.resolve(filePath) !== path.resolve(codexPath)) return fileOptions;
      return {
        ...fileOptions,
        additionalArguments: [
          ...(fileOptions.additionalArguments ?? []),
          '--identifier',
          CODEX_IDENTIFIER
        ],
        entitlements: CODEX_ENTITLEMENTS
      };
    }
  };
}

export default async function signMasApp(options) {
  const { signAsync } = await import('@electron/osx-sign');
  await signAsync(createMasSignOptions(options));
}
