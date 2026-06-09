import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { listLocalFiles, readLocalFile, saveLocalFile } from '../database/localFiles.js';

import { asNullableFiniteNumber } from './commandParserPrimitives.js';
import { asBoolean, asNullableString, asString } from './commandParsers.js';

export async function handleLocalFileStorageCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.listLocalFiles) {
    return listLocalFiles();
  }
  if (command === NATIVE_COMMANDS.readLocalFile) {
    return readLocalFile(asString(args.path, 'path'));
  }
  if (command === NATIVE_COMMANDS.saveLocalFile) {
    return saveLocalFile({
      content: asString(args.content, 'content'),
      expectedFileSize: asNullableFiniteNumber(args.expectedFileSize, 'expectedFileSize'),
      expectedModifiedAt: asNullableString(args.expectedModifiedAt, 'expectedModifiedAt'),
      force: asBoolean(args.force ?? false, 'force'),
      path: asString(args.path, 'path')
    });
  }
  return undefined;
}
