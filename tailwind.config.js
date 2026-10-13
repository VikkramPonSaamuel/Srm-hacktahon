/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        burgundy: {
          DEFAULT: '#6D1735',
          deep: '#431024',
          dark: '#2A0A17',
          accent: '#8D3151',
          subtle: '#FAF8F9',
          muted: '#E8DDE2',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          white: '#FFFFFF',
          offwhite: '#FAF8F9',
          cream: '#FAF8F9',
          ivory: '#FFFFFF',
          secondary: '#F3EEF1',
          light: '#F3EEF1',
        },
        border: {
          DEFAULT: '#E8DDE2',
          warm: '#E8DDE2',
          subtle: '#E8DDE2',
          strong: '#D5C4CD',
        },
        ink: {
          primary: '#24151C',
          secondary: '#776771',
          muted: '#A0919B',
        },
        status: {
          healthy: '#16845B',
          success: '#16845B',
          warning: '#C78625',
          critical: '#C43C4B',
          danger: '#C43C4B',
          info: '#5578C7',
          neutral: '#776771',
        },
      },
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', '"Manrope"', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(36, 21, 28, 0.04)',
        elevated: '0 4px 16px -2px rgba(36, 21, 28, 0.08), 0 2px 4px -2px rgba(36, 21, 28, 0.04)',
        dialog: '0 20px 40px -8px rgba(42, 10, 23, 0.22), 0 6px 14px -2px rgba(42, 10, 23, 0.08)',
        glow: '0 0 24px -4px rgba(109, 23, 53, 0.35)',
        'depth-sm': '0 1px 3px rgba(36, 21, 28, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'depth-md': '0 4px 16px -2px rgba(36, 21, 28, 0.06), 0 1px 3px rgba(36, 21, 28, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        'depth-lg': '0 12px 32px -4px rgba(36, 21, 28, 0.09), 0 4px 12px -2px rgba(36, 21, 28, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
        'burgundy-glow': '0 8px 24px -4px rgba(109, 23, 53, 0.25), 0 2px 6px -1px rgba(109, 23, 53, 0.15)',
        bevel: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(36, 21, 28, 0.04)',
      },
    },
  },
  plugins: [],
};
