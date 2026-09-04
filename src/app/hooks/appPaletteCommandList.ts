import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../lib/core/nodes/folderTopicItemCommands';
import { FOUR_WAY_NAVIGATION_COMMANDS } from '../../../lib/core/nodes/fourWayNavigationCommands';
import { VIRTUAL_FOLDER_COMMAND } from '../../../lib/core/nodes/virtualFolderCommands';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { DEVELOPER_PALETTE_COMMANDS } from './appPaletteDeveloperCommands';
import { HELP_PALETTE_COMMANDS } from './appPaletteHelpCommands';
import { REVIEW_PALETTE_COMMANDS } from './appPaletteReviewCommands';
import { SETTINGS_PALETTE_COMMANDS } from './appPaletteSettingsCommands';

export interface AppPaletteCommandMeta {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
}

export const APP_PALETTE_COMMANDS: AppPaletteCommandMeta[] = [
  ...FOLDER_TOPIC_ITEM_COMMANDS.map((command) => ({
    id: command.appCommandId,
    keywords: ['create', command.kind],
    section: 'Create',
    title: command.paletteTitle
  })),
  {
    id: VIRTUAL_FOLDER_COMMAND.appCommandId,
    keywords: ['create', 'virtual', 'folder', 'collection'],
    section: 'Create',
    title: VIRTUAL_FOLDER_COMMAND.paletteTitle
  },
  { id: APP_COMMAND_IDS.undo, title: 'Undo', section: 'Workspace', keywords: ['undo', 'history'] },
  { id: APP_COMMAND_IDS.redo, title: 'Redo', section: 'Workspace', keywords: ['redo', 'history'] },
  { id: APP_COMMAND_IDS.openLocalFile, title: 'Open File', section: 'Workspace', keywords: ['open', 'markdown', 'file', 'local'] },
  { id: APP_COMMAND_IDS.importSingleFile, title: 'Import Files', section: 'Import', keywords: ['import', 'inbox', 'file', 'files'] },
  { id: APP_COMMAND_IDS.importFolder, title: 'Import Folder', section: 'Import', keywords: ['import', 'folder', 'directory', 'inbox'] },
  { id: APP_COMMAND_IDS.clipboardImport, title: 'Import Clipboard', section: 'Import', keywords: ['import', 'clipboard', 'paste'] },
  ...DEVELOPER_PALETTE_COMMANDS,
  { id: APP_COMMAND_IDS.openTrash, title: 'Open Trash', section: 'Workspace' },
  { id: APP_COMMAND_IDS.openGuidedSample, title: 'Open Guided Sample', section: 'Workspace', keywords: ['guide', 'sample', 'tutorial', 'start'] },
  { id: APP_COMMAND_IDS.openWorkspaceSearch, title: 'Search', section: 'Workspace', keywords: ['search', 'find', 'topics', 'workspace'] },
  { id: APP_COMMAND_IDS.openCommandPalette, title: 'Command Palette', section: 'Workspace', keywords: ['command', 'palette', 'actions'] },
  { id: APP_COMMAND_IDS.renameNode, title: 'Rename', section: 'Workspace', keywords: ['rename', 'topic', 'folder'] },
  { id: APP_COMMAND_IDS.exportCurrentArticle, title: 'Export Current Topic', section: 'Editor', keywords: ['export', 'topic', 'article', 'mirror', 'markdown', 'save'] },
  { id: APP_COMMAND_IDS.publishToFoliole, title: 'Publish to the site', section: 'Editor', keywords: ['publish', 'foliole', 'site', 'cloudflare', 'web'] },
  { id: APP_COMMAND_IDS.publishToDiscourse, title: 'Publish to Discourse', section: 'Editor', keywords: ['publish', 'discourse', 'topic', 'forum'] },
  { id: APP_COMMAND_IDS.publishToWordPress, title: 'Publish to WordPress', section: 'Editor', keywords: ['publish', 'wordpress', 'post', 'blog'] },
  { id: APP_COMMAND_IDS.splitTopic, title: 'Split Topic', section: 'Editor', keywords: ['split', 'topic', 'sections'] },
  { id: APP_COMMAND_IDS.mergeHighlightsIntoTopic, title: 'Merge highlights', section: 'Editor', keywords: ['merge', 'highlights', 'topic', 'append', 'file'] },
  { id: APP_COMMAND_IDS.createSelectionHighlight, title: 'Highlight Selection', section: 'Editor', keywords: ['highlight', 'selection', 'excerpt'] },
  { id: APP_COMMAND_IDS.createSelectionCloze, title: 'Cloze Selection', section: 'Editor', keywords: ['cloze', 'selection', 'item'] },
  { id: APP_COMMAND_IDS.addSelectionNote, title: 'Annotate Selection', section: 'Editor', keywords: ['highlight', 'selection', 'annotation'] },
  { id: APP_COMMAND_IDS.repairTable, title: 'Repair Table', section: 'Editor', keywords: ['markdown', 'table', 'repair'] },
  { id: APP_COMMAND_IDS.restartApp, title: 'Restart App', section: 'Workspace', keywords: ['restart', 'relaunch'] },
  { id: APP_COMMAND_IDS.toggleList, title: 'Toggle Left Sidebar', section: 'Workspace', keywords: ['sidebar', 'left'] },
  { id: APP_COMMAND_IDS.toggleRightSidebar, title: 'Toggle Right Sidebar', section: 'Workspace', keywords: ['sidebar', 'right', 'inspector'] },
  { id: APP_COMMAND_IDS.toggleBothSidebars, title: 'Toggle Both Sidebars', section: 'Workspace', keywords: ['sidebar', 'focus'] },
  { id: APP_COMMAND_IDS.increaseContentRegionScale, title: 'Increase Panel Content Size', section: 'View', keywords: ['zoom', 'panel', 'text', 'size'] },
  { id: APP_COMMAND_IDS.decreaseContentRegionScale, title: 'Decrease Panel Content Size', section: 'View', keywords: ['zoom', 'panel', 'text', 'size'] },
  { id: APP_COMMAND_IDS.resetContentRegionScale, title: 'Reset Panel Content Size', section: 'View', keywords: ['zoom', 'panel', 'text', 'size'] },
  { id: APP_COMMAND_IDS.toggleDevTools, title: 'Toggle DevTools', section: 'Developer', keywords: ['developer', 'inspect'] },
  ...SETTINGS_PALETTE_COMMANDS,
  { id: APP_COMMAND_IDS.openHelpSearch, title: 'DEV Open Help Search', section: 'Workspace', keywords: ['help', 'search', 'guide'] },
  ...HELP_PALETTE_COMMANDS,
  ...FOUR_WAY_NAVIGATION_COMMANDS.map((command) => ({
    id: command.appCommandId,
    keywords: command.keywords,
    section: 'Navigation',
    title: command.title
  })),
  { id: APP_COMMAND_IDS.goToNode, title: 'Go to...', section: 'Navigation', keywords: ['search', 'open', 'node', 'jump', 'folder', 'topic', 'item'] },
  { id: APP_COMMAND_IDS.moveToNode, title: 'Move to...', section: 'Navigation', keywords: ['move', 'reparent'] },
  { id: APP_COMMAND_IDS.findInTopic, title: 'Find in Topic', section: 'Navigation', keywords: ['find', 'search', 'topic', 'document', 'text'] },
  { id: APP_COMMAND_IDS.toggleComparisonView, title: 'Compare with Draft', section: 'Editor', keywords: ['compare', 'diff', 'paste', 'draft'] },
  { id: APP_COMMAND_IDS.toggleImmersiveMode, title: 'Toggle Immersive Reading', section: 'Editor', keywords: ['immersive', 'reading', 'focus', 'fullscreen'] },
  { id: APP_COMMAND_IDS.toggleDismissedTopicsVisibility, title: 'Toggle Topic Focus', section: 'Workspace', keywords: ['dismissed', 'topics', 'hide', 'show', 'focus'] },
  { id: APP_COMMAND_IDS.enterPriorityMode, title: 'Set Priority...', section: 'Editor', keywords: ['priority', 'queue', 'p0', 'p1', 'quick set'] },
  { id: APP_COMMAND_IDS.toggleEditorDisplayMode, title: 'Toggle Editor Display Mode', section: 'Editor' },
  { id: APP_COMMAND_IDS.scrollDocumentTop, title: 'Scroll to Document Top', section: 'Navigation', keywords: ['scroll', 'document', 'top', 'start'] },
  { id: APP_COMMAND_IDS.scrollDocumentBottom, title: 'Scroll to Document Bottom', section: 'Navigation', keywords: ['scroll', 'document', 'bottom', 'end'] },
  ...REVIEW_PALETTE_COMMANDS
];
