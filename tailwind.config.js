/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f6f8fb',
        'bg-subtle': '#f8fafc',
        'bg-panel': '#ffffff',
        'bg-elevated': '#ffffff',
        border: {
          DEFAULT: 'rgba(15, 23, 42, 0.14)',
          strong: 'rgba(79, 70, 229, 0.42)'
        },
        accent: {
          DEFAULT: '#4f46e5',
          strong: '#4338ca',
          foreground: '#eef2ff'
        },
        background: '#f6f8fb',
        foreground: '#0f172a',
        primary: {
          DEFAULT: '#4f46e5',
          foreground: '#eef2ff'
        },
        secondary: {
          DEFAULT: '#e2e8f0',
          foreground: '#1e293b'
        },
        muted: {
          DEFAULT: '#f8fafc',
          foreground: '#475569'
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#0f172a'
        },
        popover: {
          DEFAULT: '#ffffff',
          foreground: '#0f172a'
        },
        destructive: {
          DEFAULT: '#fb7185',
          foreground: '#ffffff'
        },
        input: 'rgba(15, 23, 42, 0.14)',
        ring: '#4338ca'
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
