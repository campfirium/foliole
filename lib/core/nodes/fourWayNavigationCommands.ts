export const FOUR_WAY_NAVIGATION_COMMAND_IDS = {
  goBack: 'navigation.goBack',
  goToLastChild: 'navigation.goToLastChild',
  goForward: 'navigation.goForward',
  goParent: 'navigation.goParent'
} as const;

export type FourWayNavigationCommandId =
  (typeof FOUR_WAY_NAVIGATION_COMMAND_IDS)[keyof typeof FOUR_WAY_NAVIGATION_COMMAND_IDS];

export interface FourWayNavigationCommand {
  appCommandId: FourWayNavigationCommandId;
  keywords: string[];
  title: string;
}

export const FOUR_WAY_NAVIGATION_COMMANDS: FourWayNavigationCommand[] = [
  { appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goBack, keywords: ['back', 'history'], title: 'Go Back' },
  { appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goForward, keywords: ['forward', 'history'], title: 'Go Forward' },
  { appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goParent, keywords: ['parent', 'up'], title: 'Go Up' },
  {
    appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goToLastChild,
    keywords: ['last', 'topic', 'folder', 'item', 'down'],
    title: 'Go Down'
  }
];

export function isFourWayNavigationCommandId(commandId: string): commandId is FourWayNavigationCommandId {
  return FOUR_WAY_NAVIGATION_COMMANDS.some((command) => command.appCommandId === commandId);
}
