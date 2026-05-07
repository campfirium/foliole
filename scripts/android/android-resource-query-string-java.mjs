const HEADER = `package com.foliole.android;

final class FolioleCompanionResourceQueryStringKeys {
    private FolioleCompanionResourceQueryStringKeys() {}

`;

export function buildAndroidResourceQueryStringJava(sections) {
  const scalarCases = scalarEntries(sections).map(caseLine).join('\n');
  const nestedCases = nestedEntries(sections).map(caseLine).join('\n');
  return `${HEADER}    static String string(String section, String group, String key) {
        switch (section + "." + group + "." + key) {
${scalarCases}
            default: throw new IllegalStateException("Companion resource query descriptor is missing string key: " + section + "." + group + "." + key);
        }
    }

    static String nestedString(String section, String group, String object, String key) {
        switch (section + "." + group + "." + object + "." + key) {
${nestedCases}
            default: throw new IllegalStateException("Companion resource query descriptor is missing nested string key: " + section + "." + group + "." + object + "." + key);
        }
    }
}
`;
}

function scalarEntries(sections) {
  return Object.entries(sections).flatMap(([section, groups]) =>
    Object.entries(groups).flatMap(([group, rules]) =>
      Object.entries(rules)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => ({ path: `${section}.${group}.${key}`, value }))
    )
  );
}

function nestedEntries(sections) {
  return Object.entries(sections).flatMap(([section, groups]) =>
    Object.entries(groups).flatMap(([group, rules]) =>
      Object.entries(rules)
        .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
        .flatMap(([object, values]) =>
          Object.entries(values)
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => ({ path: `${section}.${group}.${object}.${key}`, value }))
        )
    )
  );
}

function caseLine({ path, value }) {
  return `            case ${javaString(path)}: return ${javaString(value)};`;
}

function javaString(value) {
  return JSON.stringify(value);
}
