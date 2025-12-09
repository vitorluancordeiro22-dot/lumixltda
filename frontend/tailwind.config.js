/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#FFFFFF',
        foreground: '#1E293B',
        card: '#FFFFFF',
        'card-foreground': '#1E293B',
        primary: '#0EA5E9',
        'primary-foreground': '#FFFFFF',
        secondary: '#F1F5F9',
        'secondary-foreground': '#1E293B',
        muted: '#F8FAFC',
        'muted-foreground': '#475569',
        accent: '#0EA5E9',
        'accent-foreground': '#FFFFFF',
        destructive: '#EF4444',
        'destructive-foreground': '#FFFFFF',
        border: '#E2E8F0',
        input: '#FFFFFF',
        ring: '#0EA5E9',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        heading: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
