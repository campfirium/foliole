/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    'bg-settings-shell',
    'bg-settings-sidebar',
    'bg-settings-group',
    'bg-settings-selected',
    'bg-settings-control-active',
    'bg-settings-switch-off',
    'bg-settings-switch-on',
    'bg-settings-switch-knob',
    'text-settings-icon',
    'text-settings-icon-hover',
    'text-settings-icon-active',
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
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        'bg-subtle': 'rgb(var(--color-bg-subtle) / <alpha-value>)',
        'bg-panel': 'rgb(var(--color-bg-panel) / <alpha-value>)',
        'bg-elevated': 'rgb(var(--color-bg-elevated) / <alpha-value>)',
        'companion-base': '#ffffff',
        'companion-content': '#ffffff',
        'companion-subtle': '#f7f7f5',
        'companion-divider': 'rgba(31, 35, 40, 0.08)',
        'companion-divider-strong': 'rgba(31, 35, 40, 0.12)',
        'companion-accent': '#2f7d6b',
        'companion-accent-soft': 'rgba(47, 125, 107, 0.12)',
        'companion-text-secondary': '#6b7280',
        'companion-text-tertiary': '#9ca3af',
        divider: 'rgb(var(--color-divider) / <alpha-value>)',
        'panel-outline': 'rgb(var(--color-foreground) / 0.14)',
        'settings-shell': 'var(--app-settings-shell-bg)',
        'settings-sidebar': 'var(--app-settings-sidebar-bg)',
        'settings-group': 'var(--app-settings-group-bg)',
        'settings-selected': 'var(--app-settings-selected-bg)',
        'settings-control': 'var(--app-settings-control-bg)',
        'settings-control-hover': 'var(--app-settings-control-hover-bg)',
        'settings-control-active': 'var(--app-settings-control-active-bg)',
        'settings-switch-off': 'var(--app-settings-switch-off-bg)',
        'settings-switch-on': 'var(--app-settings-switch-on-bg)',
        'settings-switch-knob': 'var(--app-settings-switch-knob-bg)',
        'settings-icon': 'var(--app-settings-icon-color)',
        'settings-icon-hover': 'var(--app-settings-icon-hover-color)',
        'settings-icon-active': 'var(--app-settings-icon-active-color)',
        'settings-divider': 'rgb(var(--color-settings-divider) / <alpha-value>)',
        'settings-outline': 'rgb(var(--color-foreground) / 0.14)',
        'settings-control-border': 'var(--app-settings-control-border-color)',
        'settings-control-border-hover': 'var(--app-settings-control-border-hover-color)',
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          strong: 'rgb(var(--color-accent-strong) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)'
        },
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: '#5f6368',
          foreground: '#f7f7f5'
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--color-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)'
        },
        card: {
          DEFAULT: 'rgb(var(--color-card) / <alpha-value>)',
          foreground: 'rgb(var(--color-foreground) / <alpha-value>)'
        },
        popover: {
          DEFAULT: 'rgb(var(--color-popover) / <alpha-value>)',
          foreground: 'rgb(var(--color-foreground) / <alpha-value>)'
        },
        destructive: {
          DEFAULT: '#fb7185',
          foreground: '#ffffff'
        },
        input: 'rgb(var(--color-border) / <alpha-value>)',
        ring: 'rgb(var(--color-accent) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['var(--font-family-interface)'],
        mono: ['var(--font-family-mono)']
      },
      boxShadow: {
        popover: '0 18px 40px rgba(15, 17, 19, 0.12)',
        panel: '0 10px 24px rgba(15, 17, 19, 0.08)',
        settings: '0 18px 42px rgba(15, 17, 19, 0.08), 0 2px 6px rgba(15, 17, 19, 0.03)'
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        companion: '10px'
      }
    }
  },
  plugins: []
};
