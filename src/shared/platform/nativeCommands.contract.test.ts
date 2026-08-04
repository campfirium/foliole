import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { canRecordNativeCommandArgs } from '../../../lib/platform/nativeCommandPrivacy';
import { NATIVE_COMMANDS, isTypedNativeCommand } from '../../../lib/platform/nativeCommands';

const PLATFORM_DIR = join(process.cwd(), 'lib/platform');
const CONTRACT_FILES = [
  'nativeAideStorageContract.ts',
  'nativeAssistantContract.ts',
  'nativeAssistantCommandContract.ts',
  'nativeContract.ts',
  'nativeDiscoursePublishContract.ts',
  'nativeDisplayScaleContract.ts',
  'nativeExternalSearchCommandMap.ts',
  'nativeFoliolePublishContract.ts',
  'nativeImportCommandMap.ts',
  'nativeInitialLibrarySetupContract.ts',
  'nativeLocalFileCommandMap.ts',
  'nativeMoveCommandMap.ts',
  'nativeReadwiseCommandMap.ts',
  'nativeRemoteImageCommandMap.ts',
  'nativeSearchIndexCommandMap.ts',
  'nativeSplitTopicPreferencesContract.ts',
  'nativeSyncCommandMap.ts',
  'nativeTrashCommandMap.ts',
  'nativeUpdateContract.ts',
  'nativeWordPressPublishContract.ts',
  'nativeUtilityCommandMap.ts'
];

function readPlatformSource(fileName: string) {
  return readFileSync(join(PLATFORM_DIR, fileName), 'utf8');
}

function collectNativeCommandReferences(fileName: string) {
  const source = ts.createSourceFile(fileName, readPlatformSource(fileName), ts.ScriptTarget.Latest, true);
  const references = new Set<string>();

  function visit(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'NATIVE_COMMANDS') {
      references.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return references;
}

function collectContractCommandReferences() {
  return CONTRACT_FILES.reduce<Set<string>>((references, fileName) => {
    collectNativeCommandReferences(fileName).forEach((commandKey) => references.add(commandKey));
    return references;
  }, new Set<string>());
}

describe('native command contracts', () => {
  it('keeps native command values unique and typed', () => {
    const values = Object.values(NATIVE_COMMANDS);

    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => isTypedNativeCommand(value))).toBe(true);
  });

  it('covers every native command constant in contract maps', () => {
    const commandKeys = Object.keys(NATIVE_COMMANDS).sort();
    const referencedKeys = [...collectContractCommandReferences()].sort();

    expect(referencedKeys).toEqual(commandKeys);
  });

  it('keeps WordPress draft and connection credentials out of command traces', () => {
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.saveWordPressPublishDraft)).toBe(false);
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.connectWordPressPublishSettings)).toBe(false);
  });
});
