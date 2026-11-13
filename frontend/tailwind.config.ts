import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        line: "var(--line)",
        lineStrong: "var(--line-strong)",
        ink: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        accentText: "var(--accent-text)",
      },
      boxShadow: {
        lift: "var(--shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
