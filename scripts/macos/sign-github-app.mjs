import { fileURLToPath, URL } from 'node:url';

import { createMacSignOptions } from './sign-mas-app.mjs';

const CODEX_ENTITLEMENTS = fileURLToPath(
  new URL('../../build/entitlements.mac.inherit.plist', import.meta.url)
);
const TOOL_ENTITLEMENTS = fileURLToPath(
  new URL('../../build/entitlements.mac.tool.plist', import.meta.url)
);

export function createGithubSignOptions(options) {
  return createMacSignOptions(options, {
    codex: CODEX_ENTITLEMENTS,
    tool: TOOL_ENTITLEMENTS
  });
}

export default async function signGithubApp(options) {
  const { signAsync } = await import('@electron/osx-sign');
  await signAsync(createGithubSignOptions(options));
}
