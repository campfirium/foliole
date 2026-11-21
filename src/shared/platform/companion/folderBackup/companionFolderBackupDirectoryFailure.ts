// Native backup errors are plain text, so only messages that mean the chosen folder itself
// can no longer be used ask the user to choose again; any other failure retries the same folder.
const directoryFailures = [
  /permission denial/i, // Android SAF after the persisted tree grant is revoked
  /directory permission unavailable/i,
  /no persistable permission/i,
  /backup folder is (?:unavailable|not configured)/i, // iOS bookmark or scope cannot be opened
  /cannot read backup directory/i, // Android provider no longer lists the tree
  /unrecognized backup file/i // the folder holds a file this backup does not own
];

export function isCompanionFolderBackupDirectoryFailure(message: string | null | undefined) {
  return Boolean(message) && directoryFailures.some(pattern => pattern.test(message!));
}
