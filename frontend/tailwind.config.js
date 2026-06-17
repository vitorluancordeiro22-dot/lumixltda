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

        secondary: "rgb(var(--secondary) / 1)",
        "secondary-foreground": "rgb(var(--secondary-foreground) / 1)",

        muted: "rgb(var(--muted) / 1)",
        "muted-foreground": "rgb(var(--muted-foreground) / 1)",

        accent: "rgb(var(--primary) / 1)",
        "accent-foreground": "rgb(var(--primary-foreground) / 1)",

        destructive: "#EF4444",
        "destructive-foreground": "#FFFFFF",

        border: "rgb(var(--border) / 1)",
        input: "rgb(var(--background) / 1)",
        ring: "rgb(var(--primary) / 1)",

      },

      fontFamily: {
        sans: ["Manrope", "Inter", "system-ui", "-apple-system", "sans-serif"],
        heading: ["Manrope", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },

      borderRadius: {
        '2xl': "1rem",
        xl: "0.75rem",
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
      },

      boxShadow: {
        'soft': '0 1px 2px 0 rgb(0 0 0 / 0.02), 0 2px 10px 0 rgb(0 0 0 / 0.03)',
        'lift': '0 4px 20px 0 rgb(0 0 0 / 0.06), 0 1px 3px 0 rgb(0 0 0 / 0.04)',
        'premium': '0 8px 30px 0 rgb(0 0 0 / 0.06)',
      },

    },
  },

  plugins: [
    require("tailwindcss-animate"),
  ],

};