import { loadDesktopDeviceId } from './deviceIdentity.js';

export function isLocalExternalFolder(source: { type_settings_json: string }) {
  const localId = loadDesktopDeviceId();
  if (!localId) return false;
  try {
    const settings: unknown = JSON.parse(source.type_settings_json);
    return Boolean(settings && typeof settings === 'object' &&
      'ownerDeviceIdentityKey' in settings && settings.ownerDeviceIdentityKey === localId);
  } catch {
    return false;
  }
}
