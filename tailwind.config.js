/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4efe6',
        'bg-subtle': '#fbf7ef',
        'bg-panel': '#fffdf8',
        'bg-elevated': '#fffaf3',
        border: {
          DEFAULT: 'rgba(120, 106, 80, 0.24)',
          strong: 'rgba(180, 83, 9, 0.35)'
        },
        accent: {
          DEFAULT: '#d97706',
          strong: '#b45309',
          foreground: '#fff7ed'
        },
        background: '#f4efe6',
        foreground: '#2f241a',
        primary: {
          DEFAULT: '#d97706',
          foreground: '#fff7ed'
        },
        secondary: {
          DEFAULT: '#f3e8d2',
          foreground: '#5b4632'
        },
        muted: {
          DEFAULT: '#fffaf3',
          foreground: '#7a6248'
        },
        card: {
          DEFAULT: '#fffdf8',
          foreground: '#2f241a'
        },
        popover: {
          DEFAULT: '#fffdf8',
          foreground: '#2f241a'
        },
        destructive: {
          DEFAULT: '#fb7185',
          foreground: '#ffffff'
        },
        input: 'rgba(120, 106, 80, 0.24)',
        ring: '#b45309'
      },
      fontFamily: {
        sans: ['Segoe UI', 'IBM Plex Sans', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.625rem',
        sm: '0.5rem'
      }
    }
  },
  plugins: []
};
