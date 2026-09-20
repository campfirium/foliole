import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import contractFiles from '../../../lib/platform/nativeCommandContractFiles.json';
import { canRecordNativeCommandArgs } from '../../../lib/platform/nativeCommandPrivacy';
import { NATIVE_COMMANDS, isTypedNativeCommand } from '../../../lib/platform/nativeCommands';
import { NATIVE_SOURCE_CONNECTION_COMMANDS } from '../../../lib/platform/nativeSourceConnectionCommands';

function readPlatformSource(fileName: string) {
  return readFileSync(join(process.cwd(), fileName), 'utf8');
}

function collectNativeCommandReferences(fileName: string) {
  const source = ts.createSourceFile(
    fileName,
    readPlatformSource(fileName),
    ts.ScriptTarget.Latest,
    true
  );
  const references = new Set<string>();

  function visit(node: ts.Node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText(source) === 'NATIVE_COMMANDS'
    ) {
      references.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return references;
}

function collectContractCommandReferences() {
  return contractFiles.reduce<Set<string>>((references, fileName) => {
    collectNativeCommandReferences(fileName).forEach((commandKey) => references.add(commandKey));
    return references;
  }, new Set(Object.keys(NATIVE_SOURCE_CONNECTION_COMMANDS)));
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

  it('keeps credentials and user-authored setting values out of command traces', () => {
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.assistantSaveByokSettings)).toBe(false);
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.assistantTestModel)).toBe(false);
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.assistantSaveModelDraft)).toBe(false);
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.saveWordPressPublishDraft)).toBe(false);
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.connectWordPressPublishSettings)).toBe(false);
    expect(canRecordNativeCommandArgs(NATIVE_COMMANDS.saveSystemEntryDisplayNames)).toBe(false);
  });
});
