import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import BackHandler from "@/components/BackHandler";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "yuicry",
  description: "Музыка без лишнего",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
  ],
};

const themeScript = `
try {
  var saved = localStorage.getItem("yuicry-theme");
  var light = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = saved || (light ? "light" : "dark");

  var raw = localStorage.getItem("yuicry-accent");
  if (raw) {
    var accent = JSON.parse(raw);
    var style = document.documentElement.style;
    if (accent && accent.color) {
      style.setProperty("--accent", accent.color);
      style.setProperty("--accent-rgb", accent.rgb);
      style.setProperty("--accent-text", accent.text);
      style.setProperty("--accent-text-rgb", accent.textRgb);
    }
  }
} catch (error) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" data-theme="dark" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <BackHandler />
        {children}
      </body>
    </html>
  );
}
