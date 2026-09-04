const CURRENT_SOURCE_REIMPORT_CONTRACT_TESTS = [
  'electron/import/currentSourceReimport.test.ts'
];

const READWISE_TOPIC_MERGE_CONTRACT_TESTS = [
  'electron/import/readwiseTopicMerge.test.ts'
];

const MOUSE_GESTURE_SETTINGS_SEARCH_CONTRACT_TESTS = [
  'src/features/settings/components/SettingsPanel.search.test.tsx'
];

const MOUSE_GESTURE_FOLDER_INTEGRATION_TESTS = [
  'src/app/components/DocumentPanelFolderSpecialContent.test.tsx',
  'src/app/components/DocumentPanelSection.folderNavigation.test.tsx',
  'src/app/components/DocumentPanelSection.hookCrash.test.tsx'
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
      /^lib\/core\/database\/importHighlight(?:Anchors|BodyMatching)\.ts$/u,
      /^lib\/core\/database\/importReadwiseHighlightUpdates\.ts$/u
    ],
    tests: READWISE_TOPIC_MERGE_CONTRACT_TESTS
  },
  {
    triggers: [
      /^src\/features\/settings\/(?:components\/sections\/SettingsMouseGesture.+|model\/settingsSearchRowCatalog)\.tsx?$/u
    ],
    tests: MOUSE_GESTURE_SETTINGS_SEARCH_CONTRACT_TESTS
  },
  {
    triggers: [
      /^src\/app\/components\/(?:DocumentPanelFolderContent|FolderListMouseGestureSurface|FolderListView)\.tsx$/u,
      /^src\/features\/settings\/context\/(?:MouseGestureSettingsProvider|mouseGestureSettingsContext)\.tsx?$/u
    ],
    tests: MOUSE_GESTURE_FOLDER_INTEGRATION_TESTS
  }
];
