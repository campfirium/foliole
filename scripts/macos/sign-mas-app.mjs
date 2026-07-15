import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const CODEX_IDENTIFIER = 'com.campfirium.foliole.codex';
const POST_EVENT_PROBE_IDENTIFIER = 'com.campfirium.foliole.global-capture';
const CODEX_ENTITLEMENTS = fileURLToPath(
  new URL('../../build/entitlements.mas.tool.plist', import.meta.url)
);

export function createMasSignOptions(options) {
  const codexPath = path.join(options.app, 'Contents', 'MacOS', 'codex');
  const globalCaptureHelperPath = path.join(options.app, 'Contents', 'MacOS', 'Foliole Global Capture');
  const optionsForFile = options.optionsForFile;
  return {
    ...options,
    optionsForFile(filePath) {
      const fileOptions = {
        ...optionsForFile(filePath),
        ...(options.type === 'development' ? { timestamp: 'none' } : {})
      };
      const resolvedFilePath = path.resolve(filePath);
      if (resolvedFilePath === path.resolve(globalCaptureHelperPath)) {
        return {
          ...fileOptions,
          additionalArguments: [
            ...(fileOptions.additionalArguments ?? []),
            '--identifier',
            POST_EVENT_PROBE_IDENTIFIER
          ],
          entitlements: CODEX_ENTITLEMENTS
        };
      }
      if (resolvedFilePath !== path.resolve(codexPath)) return fileOptions;
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
