// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const nativeSourceExtensions = new Set(['.m', '.mm', '.swift']);
const requiredReasonApis = [
  ['NSPrivacyAccessedAPICategoryUserDefaults', /\b(?:UserDefaults(?:\.standard|\s*\()|NSUserDefaults)\b/],
  ['NSPrivacyAccessedAPICategoryActiveKeyboards', /\bactiveInputModes\b/],
  ['NSPrivacyAccessedAPICategoryDiskSpace', /\b(?:volumeAvailableCapacity(?:ForImportantUsage|ForOpportunisticUsage)?Key|volumeTotalCapacityKey|systemFreeSize|systemSize|statfs|statvfs|fstatfs|fstatvfs)\b/],
  ['NSPrivacyAccessedAPICategoryFileTimestamp', /\b(?:creationDate|modificationDate|fileModificationDate|contentModificationDateKey|creationDateKey|getattrlist|getattrlistbulk|fgetattrlist|fstatat|lstat|stat|fstat)\b/],
  ['NSPrivacyAccessedAPICategorySystemBootTime', /\b(?:systemUptime|mach_absolute_time)\b/]
];

function readNativeSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readNativeSources(absolutePath);
    if (!nativeSourceExtensions.has(path.extname(entry.name))) return [];
    return [{ path: path.relative(root, absolutePath), source: fs.readFileSync(absolutePath, 'utf8') }];
  });
}

function manifestCategories(manifest) {
  return [...manifest.matchAll(/<string>\s*(NSPrivacyAccessedAPICategory[^<\s]+)\s*<\/string>/g)]
    .map((match) => match[1]);
}

function detectedCategories(sources) {
  return requiredReasonApis
    .filter(([, marker]) => sources.some(({ source }) => marker.test(source)))
    .map(([category]) => category);
}

function validatePrivacyContract(manifest, sources) {
  const declared = manifestCategories(manifest);
  const detected = detectedCategories(sources);
  const missing = detected.filter((category) => !declared.includes(category));
  const unsupported = declared.filter((category) => !detected.includes(category));

  if (missing.length > 0) throw new Error(`Undeclared required-reason API categories: ${missing.join(', ')}`);
  if (unsupported.length > 0) throw new Error(`Privacy manifest categories without app-owned use: ${unsupported.join(', ')}`);
}

describe('iOS privacy manifest host contract', () => {
  it('declares only the app-local UserDefaults required reason', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');

    expect(manifest).toContain('<key>NSPrivacyAccessedAPITypes</key>');
    expect(manifest).toContain('<string>NSPrivacyAccessedAPICategoryUserDefaults</string>');
    expect(manifest).toContain('<string>CA92.1</string>');
    expect(manifest.match(/NSPrivacyAccessedAPICategory/g)).toHaveLength(1);
    expect(manifest).not.toContain('NSPrivacyTracking');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypes');
  });

  it('keeps the manifest bundled at the app root', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const packageSource = read('ios/App/Package.swift');

    expect(project).toContain('PrivacyInfo.xcprivacy */ = {isa = PBXFileReference;');
    expect(project).toContain('PrivacyInfo.xcprivacy in Resources */');
    expect(packageSource).toContain('"PrivacyInfo.xcprivacy"');
  });

  it('anchors CA92.1 to current app-owned UserDefaults usage', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');
    const sources = readNativeSources(path.join(root, 'ios/App/App'));
    const combinedSource = sources.map(({ source }) => source).join('\n');

    expect(() => validatePrivacyContract(manifest, sources)).not.toThrow();
    expect(combinedSource).toMatch(/\bUserDefaults\.standard\b/);
  });

  it('fails when all app-owned UserDefaults usage is removed', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');
    const sources = [{ path: 'ios/App/App/AppDelegate.swift', source: 'import UIKit' }];

    expect(() => validatePrivacyContract(manifest, sources))
      .toThrow('Privacy manifest categories without app-owned use: NSPrivacyAccessedAPICategoryUserDefaults');
  });

  it('fails when native code adds an undeclared required-reason API category', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');
    const sources = [
      ...readNativeSources(path.join(root, 'ios/App/App')),
      { path: 'ios/App/App/Injected.swift', source: 'let uptime = ProcessInfo.processInfo.systemUptime' }
    ];

    expect(() => validatePrivacyContract(manifest, sources))
      .toThrow('Undeclared required-reason API categories: NSPrivacyAccessedAPICategorySystemBootTime');
  });

  it('fails when the manifest loses or gains an API category', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');
    const sources = readNativeSources(path.join(root, 'ios/App/App'));
    const missingCategory = manifest.replace('NSPrivacyAccessedAPICategoryUserDefaults', 'NotAPrivacyCategory');
    const addedCategory = manifest.replace(
      '<string>NSPrivacyAccessedAPICategoryUserDefaults</string>',
      '<string>NSPrivacyAccessedAPICategoryUserDefaults</string>\n<string>NSPrivacyAccessedAPICategorySystemBootTime</string>'
    );

    expect(() => validatePrivacyContract(missingCategory, sources))
      .toThrow('Undeclared required-reason API categories: NSPrivacyAccessedAPICategoryUserDefaults');
    expect(() => validatePrivacyContract(addedCategory, sources))
      .toThrow('Privacy manifest categories without app-owned use: NSPrivacyAccessedAPICategorySystemBootTime');
  });
});
