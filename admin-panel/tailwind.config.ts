import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Islamic-modern palette: deep emerald green + warm gold
        brand: {
          50: "#eefdf4",
          100: "#d6f9e4",
          200: "#b0f1cd",
          300: "#7be3ae",
          400: "#41cd88",
          500: "#1cb26c",
          600: "#0f8f57",
          700: "#0d7148",
          800: "#0f593b",
          900: "#0e4a33",
          950: "#04291d",
        },
        gold: {
          50: "#fdfaef",
          100: "#faf1cf",
          200: "#f4e29c",
          300: "#eece63",
          400: "#e8ba3c",
          500: "#d99e22",
          600: "#c07c19",
          700: "#9f5c19",
          800: "#82491b",
          900: "#6c3d1a",
          950: "#3e1f0a",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(4, 41, 29, 0.08), 0 1px 2px rgba(4, 41, 29, 0.06)",
        "card-hover": "0 4px 16px rgba(4, 41, 29, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
