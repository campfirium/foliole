import type { DbPort } from './dbPort.js';
import { text, type JsonObject } from './syncObjectPayloadValues.js';

export interface SourceHostPayload {
  hostName: string;
  hostPlatform: string;
  sourceRef: string;
  typeSettingsJson: string;
}

export function requireSourceHostPayload(payload: JsonObject): SourceHostPayload {
  const sourceRef = text(payload.source_ref)?.trim();
  const hostName = text(payload.host_name)?.trim();
  const hostPlatform = text(payload.host_platform)?.trim();
  const typeSettingsJson = text(payload.type_settings_json);
  if (!sourceRef || !hostName || !hostPlatform || typeSettingsJson === null) {
    throw new Error('invalid_source_host_payload');
  }
  return { hostName, hostPlatform, sourceRef, typeSettingsJson };
}

export async function writeSourceHostProjection(
  port: DbPort,
  input: SourceHostPayload & {
    configRef: string;
    createdAt: string;
    rootPath: string;
    sourceType: 'external' | 'watched';
    updatedAt: string;
  }
) {
  const pathFlavor = /^[A-Za-z]:[\\/]/u.test(input.rootPath) || input.rootPath.includes('\\')
    ? 'windows' : 'posix';
  const result = await port.run(
    `INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name, host_platform,
       root_path, path_flavor, type_settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_ref) DO UPDATE SET host_name = excluded.host_name,
       host_platform = excluded.host_platform, root_path = excluded.root_path,
       path_flavor = excluded.path_flavor, type_settings_json = excluded.type_settings_json,
       updated_at = excluded.updated_at
     WHERE desktop_sources.source_type = excluded.source_type
       AND desktop_sources.config_ref = excluded.config_ref`,
    [input.sourceRef, input.sourceType, input.configRef, input.hostName, input.hostPlatform,
      input.rootPath, pathFlavor, input.typeSettingsJson, input.createdAt, input.updatedAt]
  );
  if (result.changes !== 1) throw new Error('source_identity_conflict');
}
