/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    'bg-settings-shell',
    'bg-settings-sidebar',
    'bg-settings-group',
    'bg-settings-selected',
    'bg-list-item-selected',
    'bg-settings-control-active',
    'bg-settings-segmented-active',
    'bg-settings-switch-off',
    'bg-settings-switch-on',
    'bg-settings-switch-knob',
    'text-settings-icon',
    'text-settings-icon-hover',
    'text-settings-icon-active',
    'text-settings-segmented-active-foreground',
    'hover:bg-settings-selected/70',
    'border-settings-outline',
    'border-settings-control-border',
    'border-settings-control-border-hover',
    'border-settings-divider',
    'shadow-settings'
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--role-legacy-canvas-rgb) / <alpha-value>)',
        'bg-subtle': 'rgb(var(--role-legacy-subtle-rgb) / <alpha-value>)',
        'bg-panel': 'rgb(var(--role-legacy-panel-rgb) / <alpha-value>)',
        'bg-elevated': 'rgb(var(--role-legacy-elevated-rgb) / <alpha-value>)',
        'selection-blue': 'rgb(var(--role-selection-rgb) / <alpha-value>)',
        'highlight-blue': 'rgb(var(--role-highlight-rgb) / <alpha-value>)',
        'cloze-yellow': 'rgb(var(--role-cloze-rgb) / <alpha-value>)',
        'companion-base': 'var(--companion-base)',
        'companion-content': 'var(--companion-content)',
        'companion-subtle': 'var(--companion-subtle)',
        'companion-divider': 'var(--companion-divider)',
        'companion-divider-strong': 'var(--companion-divider-strong)',
        'companion-accent': 'var(--companion-accent)',
        'companion-accent-soft': 'var(--companion-accent-soft)',
        'companion-text-secondary': 'var(--companion-text-secondary)',
        'companion-text-tertiary': 'var(--companion-text-tertiary)',
        divider: 'color-mix(in oklab, var(--app-divider-subtle) calc(<alpha-value> * 100%), transparent)',
        'panel-outline': 'rgb(var(--role-ink-rgb) / 0.14)',
        'settings-shell': 'var(--app-settings-shell-bg)',
        'settings-sidebar': 'var(--app-settings-sidebar-bg)',
        'settings-group': 'var(--app-settings-group-bg)',
        'settings-selected': 'var(--app-settings-selected-bg)',
        'list-item-selected': 'var(--app-list-item-selected-bg)',
        'settings-control': 'var(--app-settings-control-bg)',
        'settings-control-hover': 'var(--app-settings-control-hover-bg)',
        'settings-control-active': 'var(--app-settings-control-active-bg)',
        'settings-segmented-active': 'var(--app-settings-segmented-active-bg)',
        'settings-switch-off': 'var(--app-settings-switch-off-bg)',
        'settings-switch-on': 'var(--app-settings-switch-on-bg)',
        'settings-switch-knob': 'var(--app-settings-switch-knob-bg)',
        'settings-icon': 'var(--app-settings-icon-color)',
        'settings-icon-hover': 'var(--app-settings-icon-hover-color)',
        'settings-icon-active': 'var(--app-settings-icon-active-color)',
        'settings-segmented-active-foreground': 'var(--app-settings-segmented-active-fg)',
        'settings-divider': 'rgb(var(--role-legacy-settings-divider-rgb) / <alpha-value>)',
        'settings-outline': 'rgb(var(--role-ink-rgb) / 0.14)',
        'settings-control-border': 'var(--app-settings-control-border-color)',
        'settings-control-border-hover': 'var(--app-settings-control-border-hover-color)',
        'shellless-surface': 'var(--app-shellless-surface-bg)',
        'shellless-input': 'var(--app-shellless-input-bg)',
        'shellless-border': 'var(--app-shellless-border-color)',
        'shellless-divider': 'var(--app-shellless-divider-color)',
        'shellless-fg': 'var(--app-shellless-fg)',
        'shellless-title': 'var(--app-shellless-title-fg)',
        'shellless-muted': 'var(--app-shellless-muted-fg)',
        'shellless-faint': 'var(--app-shellless-faint-fg)',
        'shellless-placeholder': 'var(--app-shellless-placeholder-fg)',
        'shellless-control-fg': 'var(--app-shellless-control-fg)',
        'shellless-control-border': 'var(--app-shellless-control-border-color)',
        'shellless-control-border-hover': 'var(--app-shellless-control-border-hover-color)',
        'shellless-control-hover': 'var(--app-shellless-control-hover-bg)',
        'shellless-brand-mark': 'var(--app-shellless-brand-mark-color)',
        border: {
          DEFAULT: 'rgb(var(--role-legacy-border-rgb) / <alpha-value>)',
          strong: 'rgb(var(--role-legacy-border-strong-rgb) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--role-legacy-accent-rgb) / <alpha-value>)',
          strong: 'rgb(var(--role-legacy-accent-strong-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-legacy-accent-ink-rgb) / <alpha-value>)'
        },
        error: {
          DEFAULT: 'rgb(var(--role-danger-rgb) / <alpha-value>)',
          subtle: 'rgb(var(--role-danger-subtle-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-danger-ink-rgb) / <alpha-value>)'
        },
        'app-shell': 'rgb(var(--role-legacy-app-shell-rgb) / <alpha-value>)',
        foreground: 'rgb(var(--role-ink-rgb) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--role-legacy-accent-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-legacy-accent-ink-rgb) / <alpha-value>)'
        },
        secondary: {
          DEFAULT: 'rgb(var(--role-legacy-secondary-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-ink-rgb) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'rgb(var(--role-legacy-muted-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-ink-muted-rgb) / <alpha-value>)'
        },
        card: {
          DEFAULT: 'rgb(var(--role-legacy-card-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-ink-rgb) / <alpha-value>)'
        },
        popover: {
          DEFAULT: 'rgb(var(--role-legacy-popover-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-ink-rgb) / <alpha-value>)'
        },
        destructive: {
          DEFAULT: 'rgb(var(--role-danger-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--role-danger-ink-rgb) / <alpha-value>)'
        },
        input: 'rgb(var(--role-legacy-border-rgb) / <alpha-value>)',
        ring: 'rgb(var(--role-legacy-accent-rgb) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['var(--font-family-interface)'],
        mono: ['var(--font-family-mono)'],
        'shellless-ui': ['var(--app-shellless-ui-font-family)'],
        'shellless-input': ['var(--app-shellless-input-font-family)']
      },
      fontSize: {
        'settings-brand': ['1.05rem', { lineHeight: '1.25rem' }],
        'settings-navigation-group': ['0.72rem', { lineHeight: '1.25rem' }],
        'ui-xs': ['11px', { lineHeight: '1rem' }],
        'ui-sm': ['12px', { lineHeight: '1.25rem' }],
        'ui-base': ['13px', { lineHeight: '1.25rem' }],
        'ui-md': ['14px', { lineHeight: '1.5rem' }],
        'ui-lg': ['15px', { lineHeight: '1.5rem' }],
        'ui-input': ['16px', { lineHeight: '1.5rem' }],
        'ui-xl': ['18px', { lineHeight: '1.75rem' }],
        'reading-sm': ['14px', { lineHeight: '1.7' }],
        'reading-base': ['17px', { lineHeight: '1.75' }],
        'reading-lg': ['19px', { lineHeight: '1.8' }],
        'shellless-ui': ['var(--app-shellless-ui-font-size)', { lineHeight: '1.5rem' }],
        'shellless-meta': ['var(--app-shellless-meta-font-size)', { lineHeight: '1.25rem' }],
        'shellless-input': [
          'var(--app-shellless-input-font-size)',
          { lineHeight: 'var(--app-shellless-input-line-height)' }
        ]
      },
      spacing: {
        'settings-navigation-header': '64px',
        'dialog-column-gap': '4rem',
        'dialog-gutter': '3rem',
        'dialog-section-gap': '2.5rem',
        'panel-header': '3rem',
        'inspector-list-inset': '1rem',
        'settings-row': '5.125rem',
        'settings-panel-x': '1.25rem',
        'settings-panel-y': '1.25rem',
        'settings-flow-copy-min': '22.5rem',
        'settings-flow-control-min': '12.5rem',
        'state-surface': '7.5rem',
        'statistics-row': '1.375rem'
      },
      height: { 'floating-workspace': '47.5rem', 'statistics-panel': 'min(53.75rem, calc(100dvh - 2.25rem))' },
      minHeight: { 'dialog-notice-body': '7.5rem' },
      minWidth: { 'statistics-table': '60rem', 'statistics-time-table': '120rem' },
      maxHeight: { 'floating-workspace': 'calc(100dvh - 2rem)' },
      width: {
        'settings-navigation-brand': '220px',
        'dialog-notice': 'min(30rem, calc(100vw - 2rem))',
        'floating-workspace': '65rem',
        'statistics-panel': 'min(77.5rem, calc(100vw - 2.25rem))',
        'statistics-time': '5rem',
        'statistics-day': '2rem'
      },
      maxWidth: { 'floating-workspace': 'calc(100vw - 2rem)' },
      gridTemplateColumns: { 'statistics-time': 'repeat(2, minmax(0, 1fr)) 5rem', 'floating-workspace': 'minmax(0, var(--workspace-list-width, 18.75rem)) minmax(0, 1fr)' },
      boxShadow: {
        popover: 'var(--shadow-popover)',
        panel: 'var(--shadow-panel)',
        settings: 'var(--shadow-settings)',
        control: 'var(--shadow-control)',
        page: 'var(--shadow-page)',
        marker: 'var(--shadow-marker)',
        'inspector-section': 'var(--shadow-inspector-section)',
        'picker-thumb-ring': 'var(--shadow-picker-thumb-ring)',
        'picker-thumb-ring-strong': 'var(--shadow-picker-thumb-ring-strong)',
        shellless: 'var(--app-shellless-shadow)',
        debug: 'var(--shadow-debug)'
      },
      zIndex: {
        'local-base': 'var(--z-local-base)',
        'local-raised': 'var(--z-local-raised)',
        'local-overlay': 'var(--z-local-overlay)',
        'local-control': 'var(--z-local-control)',
        'local-feedback': 'var(--z-local-feedback)',
        'local-accent': 'var(--z-local-accent)',
        surface: 'var(--z-surface)',
        'surface-overlay': 'var(--z-surface-overlay)',
        'surface-raised': 'var(--z-surface-raised)',
        'workspace-overlay': 'var(--z-workspace-overlay)',
        floating: 'var(--z-floating)',
        debug: 'var(--z-debug)',
        'modal-overlay': 'var(--z-modal-overlay)',
        modal: 'var(--z-modal)',
        dropdown: 'var(--z-dropdown)',
        'panel-popover': 'var(--z-panel-popover)',
        'preview-dialog': 'var(--z-preview-dialog)',
        'popover-elevated': 'var(--z-popover-elevated)'
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        shellless: 'var(--app-shellless-radius)',
        'shellless-control': 'var(--app-shellless-control-radius)',
        companion: '10px'
      }
    }
  },
  plugins: []
};
