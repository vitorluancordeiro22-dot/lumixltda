/** @type {import('tailwindcss').Config} */

module.exports = {
  darkMode: "class",

  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {
    extend: {

      colors: {

        background: "rgb(var(--background) / 1)",
        foreground: "rgb(var(--foreground) / 1)",

        card: "rgb(var(--card) / 1)",
        "card-foreground": "rgb(var(--card-foreground) / 1)",

        primary: "rgb(var(--primary) / 1)",
        "primary-foreground": "rgb(var(--primary-foreground) / 1)",
        "primary-dark": "rgb(var(--primary-dark) / 1)",

        secondary: "rgb(var(--secondary) / 1)",
        "secondary-foreground": "rgb(var(--secondary-foreground) / 1)",

        "lumix-green": "#0B8F5A",
        "lumix-green-dark": "#066A43",
        "petrol-blue": "#164E63",
        "lumix-bg": "#F8FAFC",

        muted: "rgb(var(--muted) / 1)",
        "muted-foreground": "rgb(var(--muted-foreground) / 1)",
        auxiliary: "rgb(var(--auxiliary) / 1)",

        accent: "rgb(var(--primary) / 1)",
        "accent-foreground": "rgb(var(--primary-foreground) / 1)",

        destructive: "#EF4444",
        "destructive-foreground": "#FFFFFF",
        success: "rgb(var(--success) / 1)",
        warning: "rgb(var(--warning) / 1)",
        info: "rgb(var(--info) / 1)",

        border: "rgb(var(--border) / 1)",
        input: "rgb(var(--card) / 1)",
        ring: "rgb(var(--primary) / 1)",

      },

      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "-apple-system", "sans-serif"],
        heading: ["Geist", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },

      borderRadius: {
        '18': "18px",
        '2xl': "1rem",
        xl: "0.75rem",
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
      },

      transitionDuration: {
        '250': '250ms',
      },

      boxShadow: {
        'soft': '0 1px 2px 0 rgb(0 0 0 / 0.02), 0 2px 10px 0 rgb(0 0 0 / 0.03)',
        'lift': '0 4px 20px 0 rgb(0 0 0 / 0.06), 0 1px 3px 0 rgb(0 0 0 / 0.04)',
        'premium': '0 8px 30px 0 rgb(0 0 0 / 0.06)',
        'card-soft': '0 2px 10px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 30px rgba(0,0,0,0.08)',
      },

    },
  },

  plugins: [
    require("tailwindcss-animate"),
  ],

};