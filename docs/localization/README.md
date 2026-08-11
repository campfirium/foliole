# Foliole interface localization

English TypeScript catalogs in `src/shared/localization/locales/en*.ts` are the only key and completeness source. Simplified Chinese catalogs are a human-corrected disambiguation reference, never an intermediate translation source.

The locale manifest in `lib/core/localization/appLocaleManifest.json` is the product registry for locale codes, native names, and system-language matching. Generated locale catalogs are grouped by the same functional domains as English. Each AI input record contains English, Simplified Chinese, its functional domain, surface role, and protected literals. Run `node scripts/localization/build-ai-translation-input.mjs` only after English and Simplified Chinese agree; a recorded semantic conflict blocks generation for that snapshot.

Translations must preserve the product object, action strength, risk level, information density, placeholders, markup, URLs, shortcuts, formats, brands, and every literal in `scripts/localization/protected-literals.json`. Review output by functional domain, then run `node scripts/localization/check-locales.mjs`. The release check requires full key coverage. Runtime lookup still falls back one key at a time to English, and a failed catalog import keeps the English interface usable.
