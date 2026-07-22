export type SurfaceTaxonomyEntry = {
  readonly id: string;
  readonly parent?: string;
  readonly currentToken: string;
  readonly purpose: string;
  readonly forbidden: readonly string[];
  readonly notes?: readonly string[];
};

export const SURFACE_TAXONOMY = [
  {
    id: 'app-shell',
    currentToken: '--color-app-shell',
    purpose: 'Window-level base behind the desktop workbench.',
    forbidden: ['Do not use it as a local hover, selected, or control-fill color.'],
    notes: ['Startup fallback is a state of app-shell, not a separate surface layer.'],
  },
  {
    id: 'workspace-region',
    currentToken: '--workspace-region-*-bg',
    purpose: 'Rail, folder, topic, document, and sidebar columns inside the main workbench.',
    forbidden: ['Do not flatten region-local derived colors into a single global gray.'],
    notes: ['Region dividers and scrollbars derive from the owning region background.'],
  },
  {
    id: 'document',
    currentToken: '--workspace-region-main-document-bg',
    purpose: 'The primary reading and writing surface.',
    forbidden: ['Do not borrow rail or sidebar color as the default document overlay base.'],
    notes: ['Reading typography and input scale may follow document settings, but floating surfaces do not borrow document color directly.'],
  },
  {
    id: 'panel',
    currentToken: '--color-bg-panel',
    purpose: 'Secondary inspector, settings, and sidebar panel areas.',
    forbidden: ['Do not nest decorative cards when spacing or a divider can express the group.'],
  },
  {
    id: 'panel-surface',
    parent: 'panel',
    currentToken: '--color-bg-elevated',
    purpose: 'A small raised surface inside a panel when a true local container is needed.',
    forbidden: ['Do not call this layer simply "surface"; the word is reserved for taxonomy discussion.'],
  },
  {
    id: 'floating',
    currentToken: '--app-floating-surface-bg',
    purpose: 'Menus, popovers, command palette, tooltip, and conventional dialog surfaces.',
    forbidden: ['Do not create private floating backgrounds per feature.'],
    notes: ['Review action surface remains a floating variant unless its visual model diverges.'],
  },
  {
    id: 'shellless',
    parent: 'floating',
    currentToken: '--app-shellless-surface-bg',
    purpose: 'Temporary input and status surfaces such as Quick Capture, feedback, and light toast.',
    forbidden: ['Do not add default header/body/footer chrome.', 'Do not use accent or green fills for ordinary actions.'],
    notes: [
      'The background is anchored to the floating menu family; shell-less is a lighter composition, not a separate color family.',
      'Input typography follows the reading/content scale; metadata and controls use the UI scale.',
    ],
  },
  {
    id: 'control',
    currentToken: '--app-control-bg-color',
    purpose: 'Inputs, buttons, segmented controls, switches, and small action affordances.',
    forbidden: ['Do not invent feature-local disabled, hover, or active styling.'],
  },
  {
    id: 'startup-fallback',
    parent: 'app-shell',
    currentToken: '--color-app-shell',
    purpose: 'The app-shell fallback state shown before the full renderer surface is ready.',
    forbidden: ['Do not treat startup fallback button variants as the AppButton source of truth.'],
  },
] as const satisfies readonly SurfaceTaxonomyEntry[];

export const SURFACE_TAXONOMY_IDS = SURFACE_TAXONOMY.map((entry) => entry.id);
