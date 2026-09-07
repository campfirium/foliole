import type { NativeReadwiseOriginalFileResult } from '../../../../lib/platform/nativeReadwiseApiImportContract';

export interface RuntimeReadwiseOriginalFileResult {
  attachmentId: string | null;
  reason: string | null;
  status: 'html_only' | 'localized' | 'unavailable';
}

export function toRuntimeReadwiseOriginalFile(
  value: unknown
): RuntimeReadwiseOriginalFileResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<NativeReadwiseOriginalFileResult>;
  if (
    row.status !== 'localized' && row.status !== 'html_only' && row.status !== 'unavailable' ||
    row.attachment_id !== null && typeof row.attachment_id !== 'string' ||
    row.reason !== null && typeof row.reason !== 'string'
  ) return null;
  return { attachmentId: row.attachment_id, reason: row.reason, status: row.status };
}
