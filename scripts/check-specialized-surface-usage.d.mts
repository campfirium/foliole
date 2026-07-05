export const SPECIALIZED_SURFACE_SCAN_ROOTS: string[];
export const SPECIALIZED_SURFACE_PATTERN: RegExp;
export const ALLOWED_SPECIALIZED_SURFACE_FILES: string[];

export function collectSpecializedSurfaceFiles(): string[];
export function findUnexpectedSpecializedSurfaceFiles(): string[];
