export const appFocusControlClassName =
  'app-focus-control focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export const appFocusSilentClassName =
  'app-focus-silent focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:[--tw-ring-shadow:0_0_#0000] focus-visible:[--tw-ring-shadow:0_0_#0000]';

export const appInputFocusVisibleClassName = appFocusControlClassName;

export const appInputBorderFocusVisibleClassName =
  `focus-visible:border-border-strong ${appInputFocusVisibleClassName}`;
