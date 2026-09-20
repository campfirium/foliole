export interface AttachmentMaintenanceSettings {
  automatic: boolean;
  observationThreshold: number;
}

export interface AttachmentFileEntry {
  storageKey: string;
  sizeBytes: number;
}

export interface AttachmentMaintenanceStatus extends AttachmentMaintenanceSettings {
  usedBytes: number;
  eligibleBytes: number;
  trashBytes: number;
  lastObservationDay: string | null;
  trash: AttachmentFileEntry[];
}

export type AttachmentMaintenanceRequest =
  | { action: 'status' | 'observe' | 'clean' | 'empty-trash' }
  | { action: 'configure'; settings: AttachmentMaintenanceSettings }
  | { action: 'restore'; storageKeys: string[] };

export interface AttachmentObservationState extends AttachmentMaintenanceSettings {
  databaseGeneration: string;
  lastObservationDay: string | null;
  counts: Record<string, number>;
}

export function parseAttachmentMaintenanceRequest(value: unknown): AttachmentMaintenanceRequest {
  if (!value || typeof value !== 'object') throw new Error('attachment_maintenance_request_invalid');
  const request = value as AttachmentMaintenanceRequest;
  if (['status', 'observe', 'clean', 'empty-trash'].includes(request.action)) return request;
  if (request.action === 'restore' && Array.isArray(request.storageKeys)
      && request.storageKeys.every((key) => typeof key === 'string')) return request;
  if (request.action === 'configure' && request.settings && typeof request.settings.automatic === 'boolean'
      && Number.isSafeInteger(request.settings.observationThreshold) && request.settings.observationThreshold > 0) return request;
  throw new Error('attachment_maintenance_request_invalid');
}
