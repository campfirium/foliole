export function isImportAccessDenied(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error.code === 'EACCES' || error.code === 'EPERM');
}

export function rethrowImportAccessError(error: unknown): never {
  if (isImportAccessDenied(error)) throw new Error('import_source_access_denied', { cause: error });
  throw error;
}
