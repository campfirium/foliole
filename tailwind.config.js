/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#ffffff',
        'bg-subtle': '#fcfcfc',
        'bg-panel': '#f6f6f6',
        'bg-elevated': '#ffffff',
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
        panel: '0 10px 24px rgba(15, 17, 19, 0.08)'
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px'
      }
    }
  },
  plugins: []
};
