import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  INTERFACE_FONT_OPTIONS,
  INTERFACE_FONT_SIZE_DEFAULT,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  MONOSPACE_FONT_OPTIONS,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from './appearanceSettingsOptions';

const FONT_STORAGE_KEYS = {
  uiFont: APP_SETTINGS_STORAGE_KEYS.uiFont,
  customUiFont: APP_SETTINGS_STORAGE_KEYS.customUiFont,
  interfaceFont: APP_SETTINGS_STORAGE_KEYS.interfaceFont,
  monospaceFont: APP_SETTINGS_STORAGE_KEYS.monospaceFont,
  interfaceFontSize: APP_SETTINGS_STORAGE_KEYS.interfaceFontSize,
  customInterfaceFont: APP_SETTINGS_STORAGE_KEYS.customInterfaceFont,
  customMonospaceFont: APP_SETTINGS_STORAGE_KEYS.customMonospaceFont
} as const;

function isInterfaceFontPreset(value: string): value is InterfaceFontPreset {
  return INTERFACE_FONT_OPTIONS.includes(value as InterfaceFontPreset);
}

function isMonospaceFontPreset(value: string): value is MonospaceFontPreset {
  return MONOSPACE_FONT_OPTIONS.includes(value as MonospaceFontPreset);
}

export function clampFontSize(value: number) {
  return Math.max(INTERFACE_FONT_SIZE_MIN, Math.min(INTERFACE_FONT_SIZE_MAX, Math.round(value)));
}

export function sanitizeFontFamily(value: string) {
  const cleaned = value.replace(/[;{}]/g, '').replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
  const primaryName = cleaned.split(/\s+&\s+/)[0]?.trim() ?? '';
  return primaryName.slice(0, 256);
}

export function getInterfaceFontPreset(): InterfaceFontPreset {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.interfaceFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function getUiFontPreset(): InterfaceFontPreset {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.uiFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function setUiFontPreset(value: InterfaceFontPreset) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.uiFont, value);
}

export function setInterfaceFontPreset(value: InterfaceFontPreset) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.interfaceFont, value);
}

export function getCustomUiFont() {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.customUiFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomUiFont(value: string) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.customUiFont, sanitizeFontFamily(value));
}

export function getCustomInterfaceFont() {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.customInterfaceFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomInterfaceFont(value: string) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.customInterfaceFont, sanitizeFontFamily(value));
}

export function getCustomMonospaceFont() {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.customMonospaceFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomMonospaceFont(value: string) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.customMonospaceFont, sanitizeFontFamily(value));
}

export function getMonospaceFontPreset(): MonospaceFontPreset {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.monospaceFont);
  return raw && isMonospaceFontPreset(raw) ? raw : 'default';
}

export function setMonospaceFontPreset(value: MonospaceFontPreset) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.monospaceFont, value);
}

export function getInterfaceFontSize() {
  const raw = getWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.interfaceFontSize);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampFontSize(parsed) : INTERFACE_FONT_SIZE_DEFAULT;
}

export function setInterfaceFontSize(value: number) {
  setWhitelistedLocalStorageItem(FONT_STORAGE_KEYS.interfaceFontSize, String(clampFontSize(value)));
}
