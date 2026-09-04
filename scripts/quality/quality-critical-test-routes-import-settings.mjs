const CURRENT_SOURCE_REIMPORT_CONTRACT_TESTS = [
  'electron/import/currentSourceReimport.test.ts'
];

const MOUSE_GESTURE_SETTINGS_SEARCH_CONTRACT_TESTS = [
  'src/features/settings/components/SettingsPanel.search.test.tsx'
];

export const IMPORT_SETTINGS_CRITICAL_TEST_ROUTES = [
  {
    triggers: [
      /^electron\/database\/importPipeline\.ts$/u,
      /^lib\/core\/database\/(?:importPipeline(?:ExistingTarget|Nodes)?|nodeBodyMutation|nodeBodyResolution|parentContentMutation)\.ts$/u
    ],
    tests: CURRENT_SOURCE_REIMPORT_CONTRACT_TESTS
  },
  {
    triggers: [
      /^src\/features\/settings\/(?:components\/sections\/SettingsMouseGesture.+|model\/settingsSearchRowCatalog)\.tsx?$/u
    ],
    tests: MOUSE_GESTURE_SETTINGS_SEARCH_CONTRACT_TESTS
  }
];
