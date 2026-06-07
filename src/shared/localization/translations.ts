import type { AppLocale } from './appLanguage';

export type TranslationKey = keyof typeof import('./locales/en').EN_TRANSLATIONS;
export type TranslationParams = Record<string, string | number>;
type TranslationCatalog = Partial<Record<TranslationKey, string>>;

const TRANSLATIONS: Partial<Record<AppLocale, TranslationCatalog>> = {};
const translationCatalogPromises = new Map<AppLocale, Promise<void>>();
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
  const template = TRANSLATIONS[locale]?.[key] ??
    STARTUP_TRANSLATION_FALLBACKS[locale]?.[key] ??
    TRANSLATIONS.en?.[key] ??
    STARTUP_TRANSLATION_FALLBACKS.en?.[key] ??
    key;
  return interpolate(template, params);
}

export function hasTranslationCatalog(locale: AppLocale) {
  return Boolean(TRANSLATIONS[locale]);
}

export function preloadTranslationCatalog(locale: AppLocale) {
  if (hasTranslationCatalog(locale)) {
    return Promise.resolve();
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

function loadTranslationCatalog(locale: AppLocale) {
  if (locale === 'zh-Hans') {
    return import('./locales/zhHans').then((module) => {
      TRANSLATIONS['zh-Hans'] = module.ZH_HANS_TRANSLATIONS;
    });
  }
  return import('./locales/en').then((module) => {
    TRANSLATIONS.en = module.EN_TRANSLATIONS;
  });
}
