import { readFileSync } from 'node:fs';
import path from 'node:path';

import { listSourceFiles } from './desktopEntryScan.testSupport';

const ANDROID_ROOT = 'android/app/src/main/java';
const IOS_ROOT = 'ios/App/App';

export type PluginMethods = Map<string, Set<string>>;
export type NativePlatform = 'android' | 'ios';

export interface SingleSidedMethods {
  plugin: string;
  platform: NativePlatform;
  methods: string[];
  reason: string;
}

export function parseAndroidPlugin(source: string) {
  const name = /@CapacitorPlugin\(\s*name\s*=\s*"([^"]+)"/u.exec(source)?.[1];
  if (!name) return null;
  const pattern = /@PluginMethod(?:\([^)]*\))?\s+(?:(?:public|synchronized|final)\s+)*void\s+(\w+)\s*\(/gu;
  return { name, methods: [...source.matchAll(pattern)].map((match) => match[1]!) };
}

/** Returns the text from the first `[` after `from` to its matching `]`. */
function bracketBody(source: string, from: number) {
  const start = source.indexOf('[', from);
  let depth = 0;
  for (let index = start; index >= 0 && index < source.length; index += 1) {
    if (source[index] === '[') depth += 1;
    if (source[index] === ']') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return '';
}

export function parseIosPlugin(source: string) {
  const name = /CAPBridgedPlugin[\s\S]*?jsName\s*=\s*"([^"]+)"/u.exec(source)?.[1];
  if (!name) return null;
  // Skip the `[CAPPluginMethod]` type annotation by reading from the assignment.
  const declaration = /pluginMethods[^=\n]*=/u.exec(source);
  const body = declaration ? bracketBody(source, declaration.index + declaration[0].length) : '';
  return { name, methods: [...body.matchAll(/"([A-Za-z_]\w*)"/gu)].map((match) => match[1]!) };
}

function collect(root: string, directory: string, extension: string, parsePlugin: typeof parseAndroidPlugin) {
  const plugins: PluginMethods = new Map();
  for (const file of listSourceFiles(root, directory).filter((entry) => entry.endsWith(extension))) {
    const plugin = parsePlugin(readFileSync(path.join(root, file), 'utf8'));
    if (plugin) plugins.set(plugin.name, new Set(plugin.methods));
  }
  return plugins;
}

export function scanNativeBridge(root: string) {
  return {
    android: collect(root, ANDROID_ROOT, '.java', parseAndroidPlugin),
    ios: collect(root, IOS_ROOT, '.swift', parseIosPlugin)
  };
}

function missingOnOtherSide(owner: PluginMethods, other: PluginMethods, platform: NativePlatform) {
  return [...owner].flatMap(([plugin, methods]) =>
    [...methods].filter((method) => !other.get(plugin)?.has(method)).map((method) => `${platform}:${plugin}.${method}`)
  );
}

export function checkNativeBridge(
  bridge: { android: PluginMethods; ios: PluginMethods },
  declared: SingleSidedMethods[]
) {
  const actual = [
    ...missingOnOtherSide(bridge.android, bridge.ios, 'android'),
    ...missingOnOtherSide(bridge.ios, bridge.android, 'ios')
  ].sort();
  const declaredKeys = declared.flatMap(({ plugin, platform, methods }) =>
    methods.map((method) => `${platform}:${plugin}.${method}`)
  );
  const known = new Set(declaredKeys);
  const found = new Set(actual);
  return {
    undeclared: actual.filter((key) => !known.has(key)),
    stale: declaredKeys.filter((key) => !found.has(key)),
    missingReason: declared.filter((item) => !item.reason.trim()).map((item) => `${item.platform}:${item.plugin}`)
  };
}
