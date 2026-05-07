const HEADER = `package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

`;
const OMITTED_SECTION_KEY_METHODS = new Set(['field', 'metricRow', 'diagnosticRowGroup']);

export function buildAndroidQueryShapeJava(assetKeys, shapeKeys) {
  return `${HEADER}final class FolioleCompanionQueryDefinitionShapeKeys {
    private FolioleCompanionQueryDefinitionShapeKeys() {}

${constantBlock('ASSET', assetKeys)}
${Object.entries(shapeKeys).map(([section, keys]) => constantBlock(constantPrefix(section), keys)).join('')}
    static String assetKey(String key) {
${switchExpression('key', 'ASSET', assetKeys, 'asset key')}
    }

${sectionMethods(shapeKeys)}
${fieldMethods()}
}
`;
}

function sectionMethods(shapeKeys) {
  return Object.entries(shapeKeys)
    .map(([section, keys]) => {
      if (OMITTED_SECTION_KEY_METHODS.has(section)) return '';
      const method = `${section}Key`;
      if (section === 'columnTypes') return keyMethod('columnType', keys);
      if (section === 'fieldTypes') return keyMethod('fieldType', keys);
      if (section === 'fieldCollections') return keyMethod('fieldCollectionKey', keys);
      if (section === 'metricRow') return keyMethod('metricRowKey', keys);
      if (section === 'diagnosticRowGroup') return keyMethod('diagnosticRowGroupKey', keys);
      return keyMethod(method, keys);
    })
    .join('\n');
}

function fieldMethods() {
  return `    static double fieldDefaultDouble(Context context, JSONObject field, double fallback) throws Exception {
        return field.optDouble(FIELD_DEFAULT_VALUE, fallback);
    }

    static long fieldDefaultLong(Context context, JSONObject field, long fallback) throws Exception {
        return field.optLong(FIELD_DEFAULT_VALUE, fallback);
    }

    static String fieldDefaultRuleKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_DEFAULT_RULE_KEY);
    }

    static boolean fieldOmitWhenNull(Context context, JSONObject field) throws Exception {
        return field.optBoolean(FIELD_OMIT_WHEN_NULL, false);
    }

    static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_OUTPUT_KEY);
    }

    static String fieldRowKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_ROW_KEY);
    }

    static boolean fieldRowBooleanLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return fieldRowLong(context, row, field) == 1;
    }

    static double fieldRowDoubleOrDefault(Context context, JSONObject row, JSONObject field, double fallback) throws Exception {
        return row.isNull(fieldRowKey(context, field)) ? fieldDefaultDouble(context, field, fallback) : fieldRowDouble(context, row, field);
    }

    static long fieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getLong(fieldRowKey(context, field));
    }

    static long fieldRowLongOrDefault(Context context, JSONObject row, JSONObject field, long fallback) throws Exception {
        return row.isNull(fieldRowKey(context, field)) ? fieldDefaultLong(context, field, fallback) : fieldRowLong(context, row, field);
    }

    static Object fieldRowNullableNonNegativeLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.isNull(fieldRowKey(context, field)) ? JSONObject.NULL : Math.max(0, fieldRowLong(context, row, field));
    }

    static String fieldRowNullableString(Context context, JSONObject row, JSONObject field) throws Exception {
        String key = fieldRowKey(context, field);
        return row.isNull(key) ? null : row.optString(key, null);
    }

    static String fieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getString(fieldRowKey(context, field));
    }

    static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_TYPE);
    }

    static String metricRowResultKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(METRIC_ROW_RESULT_KEY);
    }

    static String metricRowMetricKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(METRIC_ROW_METRIC_KEY);
    }

    static String metricRowValueKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(METRIC_ROW_VALUE_KEY);
    }

    static String diagnosticRowGroupOutputKey(Context context, JSONObject rowGroup) throws Exception {
        return rowGroup.getString(DIAGNOSTIC_ROW_GROUP_OUTPUT_KEY);
    }

    static String diagnosticRowGroupQueryKey(Context context, JSONObject rowGroup) throws Exception {
        return rowGroup.getString(DIAGNOSTIC_ROW_GROUP_QUERY_KEY);
    }

    private static double fieldRowDouble(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getDouble(fieldRowKey(context, field));
    }
`;
}

function keyMethod(name, keys) {
  const prefix = constantPrefix(name
    .replace(/Key$/, '')
    .replace(/^columnType$/, 'columnTypes')
    .replace(/^fieldType$/, 'fieldTypes')
    .replace(/^fieldCollection$/, 'fieldCollections'));
  return `    static String ${name}(Context context, String key) throws Exception {
${switchExpression('key', prefix, keys, name)}
    }
`;
}

function constantBlock(prefix, values) {
  return Object.entries(values)
    .map(([key, value]) => `    private static final String ${constantName(prefix, key)} = ${javaString(value)};`)
    .join('\n') + '\n';
}

function switchExpression(input, prefix, values, label) {
  const cases = Object.entries(values)
    .map(([key]) => `            case ${javaString(key)}: return ${constantName(prefix, key)};`)
    .join('\n');
  return `        switch (${input}) {
${cases}
            default: throw new IllegalStateException("Companion query descriptor is missing ${label}: " + ${input});
        }`;
}

function constantName(prefix, key) {
  const base = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return [prefix, base].filter(Boolean).join('_');
}

function constantPrefix(section) {
  return section
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function javaString(value) {
  return JSON.stringify(value);
}
