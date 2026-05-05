/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    'bg-settings-shell',
    'bg-settings-sidebar',
    'bg-settings-group',
    'bg-settings-selected',
    'hover:bg-settings-selected/70',
    'border-settings-outline',
    'border-settings-divider',
    'shadow-settings'
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#ffffff',
        'bg-subtle': '#fcfcfc',
        'bg-panel': '#f6f6f6',
        'bg-elevated': '#ffffff',
        'companion-base': '#ffffff',
        'companion-content': '#ffffff',
        'companion-subtle': '#f7f7f5',
        'companion-divider': 'rgba(31, 35, 40, 0.08)',
        'companion-divider-strong': 'rgba(31, 35, 40, 0.12)',
        'companion-accent': '#2f7d6b',
        'companion-accent-soft': 'rgba(47, 125, 107, 0.12)',
        'companion-text-secondary': '#6b7280',
        'companion-text-tertiary': '#9ca3af',
        divider: 'rgba(32, 33, 36, 0.08)',
        'panel-outline': 'rgba(32, 33, 36, 0.14)',
        'settings-shell': '#ffffff',
        'settings-sidebar': '#f6f6f4',
        'settings-group': '#f7f7f5',
        'settings-selected': '#ecece8',
        'settings-divider': 'rgba(32, 33, 36, 0.08)',
        'settings-outline': 'rgba(32, 33, 36, 0.14)',
        border: {
          DEFAULT: 'rgba(32, 33, 36, 0.18)',
          strong: 'rgba(32, 33, 36, 0.34)'
        },
        accent: {
          DEFAULT: '#5f6368',
          strong: '#3c4043',
          foreground: '#f7f7f5'
        },
        background: '#f5f5f3',
        foreground: '#202124',
        primary: {
          DEFAULT: '#5f6368',
          foreground: '#f7f7f5'
        },
        secondary: {
          DEFAULT: '#ececea',
          foreground: '#202124'
        },
        muted: {
          DEFAULT: '#f1f1ef',
          foreground: '#5f6368'
        },
        card: {
          DEFAULT: '#f7f7f5',
          foreground: '#202124'
        },
        popover: {
          DEFAULT: '#f7f7f5',
          foreground: '#202124'
        },
        destructive: {
          DEFAULT: '#fb7185',
          foreground: '#ffffff'
        },
        input: 'rgba(32, 33, 36, 0.18)',
        ring: '#5f6368'
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
