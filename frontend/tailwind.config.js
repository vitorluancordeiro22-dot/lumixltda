/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B1120',
        foreground: '#F8FAFC',
        card: '#151F32',
        'card-foreground': '#F8FAFC',
        primary: '#0EA5E9',
        'primary-foreground': '#0F172A',
        secondary: '#1E293B',
        'secondary-foreground': '#F8FAFC',
        muted: '#1E293B',
        'muted-foreground': '#94A3B8',
        accent: '#0EA5E9',
        'accent-foreground': '#FFFFFF',
        destructive: '#EF4444',
        border: '#1E293B',
        input: '#1E293B',
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
