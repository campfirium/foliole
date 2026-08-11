import type { AppLocale } from './appLanguage';
import type { TranslationCatalog } from './locales/catalogTypes';
import { EN_TRANSLATIONS } from './locales/en';

export type TranslationKey = keyof typeof import('./locales/en').EN_TRANSLATIONS;
export type TranslationParams = Record<string, string | number>;
const TRANSLATIONS: Partial<Record<AppLocale, TranslationCatalog>> = { en: EN_TRANSLATIONS };
const translationCatalogPromises = new Map<AppLocale, Promise<boolean>>();
const STARTUP_TRANSLATION_FALLBACKS: Partial<Record<AppLocale, TranslationCatalog>> = {
  en: {
    'shared.startup.bootHelp': 'Preparing the workspace services...',
    'shared.startup.bootTitle': 'Starting Foliole',
    'shared.startup.copyDiagnostics': 'Copy diagnostics',
    'shared.startup.errorTitle': 'Foliole startup encountered a problem',
    'shared.startup.exit': 'Exit',
    'shared.startup.eyebrow': 'Startup',
    'shared.startup.failedModule': 'Failed module: {module}',
    'shared.startup.logs': 'Logs: {path}',
    'shared.startup.openLogs': 'Open logs',
    'shared.startup.problemEyebrow': 'Startup problem',
    'shared.startup.retry': 'Retry',
    'shared.startup.unknownRendererException': 'Unknown renderer exception'
  },
  'zh-Hans': {
    'shared.startup.bootHelp': '正在准备工作区服务...',
    'shared.startup.bootTitle': '正在启动 Foliole',
    'shared.startup.copyDiagnostics': '复制诊断信息',
    'shared.startup.errorTitle': 'Foliole 启动遇到问题',
    'shared.startup.exit': '退出',
    'shared.startup.eyebrow': '启动',
    'shared.startup.failedModule': '失败模块：{module}',
    'shared.startup.logs': '日志：{path}',
    'shared.startup.openLogs': '打开日志',
    'shared.startup.problemEyebrow': '启动问题',
    'shared.startup.retry': '重试',
    'shared.startup.unknownRendererException': '未知渲染器异常'
  }
};

function interpolate(template: string, params?: TranslationParams) {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

export function translate(locale: AppLocale, key: TranslationKey, params?: TranslationParams) {
  const template = resolveTranslationTemplate(TRANSLATIONS[locale], key) ??
    STARTUP_TRANSLATION_FALLBACKS[locale]?.[key] ??
    TRANSLATIONS.en?.[key] ??
    STARTUP_TRANSLATION_FALLBACKS.en?.[key] ??
    key;
  return interpolate(template, params);
}

export function resolveTranslationTemplate(catalog: TranslationCatalog | undefined, key: TranslationKey) {
  return catalog?.[key];
}

export function hasTranslationCatalog(locale: AppLocale) {
  return Boolean(TRANSLATIONS[locale]);
}

export function preloadTranslationCatalog(locale: AppLocale): Promise<boolean> {
  if (hasTranslationCatalog(locale)) {
    return Promise.resolve(true);
  }
  const existingPromise = translationCatalogPromises.get(locale);
  if (existingPromise) {
    return existingPromise;
  }
  const promise = loadTranslationCatalog(locale).finally(() => {
    translationCatalogPromises.delete(locale);
  });
  translationCatalogPromises.set(locale, promise);
  return promise;
}

const CATALOG_LOADERS: Record<Exclude<AppLocale, 'en'>, () => Promise<TranslationCatalog>> = {
  de: () => import('./locales/de').then((module) => module.TRANSLATIONS),
  es: () => import('./locales/es').then((module) => module.TRANSLATIONS),
  fr: () => import('./locales/fr').then((module) => module.TRANSLATIONS),
  it: () => import('./locales/it').then((module) => module.TRANSLATIONS),
  ja: () => import('./locales/ja').then((module) => module.TRANSLATIONS),
  ko: () => import('./locales/ko').then((module) => module.TRANSLATIONS),
  pl: () => import('./locales/pl').then((module) => module.TRANSLATIONS),
  'pt-BR': () => import('./locales/ptBR').then((module) => module.TRANSLATIONS),
  ru: () => import('./locales/ru').then((module) => module.TRANSLATIONS),
  'zh-Hans': () => import('./locales/zhHans').then((module) => module.ZH_HANS_TRANSLATIONS),
  'zh-Hant': () => import('./locales/zh-Hant').then((module) => module.TRANSLATIONS)
};

export async function safelyLoadTranslationCatalog(loader: () => Promise<TranslationCatalog>) {
  try {
    return await loader();
  } catch {
    return null;
  }
}

async function loadTranslationCatalog(locale: AppLocale) {
  if (locale === 'en') {
    return true;
  }
  const catalog = await safelyLoadTranslationCatalog(CATALOG_LOADERS[locale]);
  if (!catalog) {
    return false;
  }
  TRANSLATIONS[locale] = catalog;
  return true;
}
