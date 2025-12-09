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
        foreground: '#0F172A',
        card: '#F8FAFC',
        'card-foreground': '#0F172A',
        primary: '#0EA5E9',
        'primary-foreground': '#FFFFFF',
        secondary: '#F1F5F9',
        'secondary-foreground': '#0F172A',
        muted: '#F1F5F9',
        'muted-foreground': '#64748B',
        accent: '#0EA5E9',
        'accent-foreground': '#FFFFFF',
        destructive: '#EF4444',
        border: '#E2E8F0',
        input: '#F8FAFC',
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
