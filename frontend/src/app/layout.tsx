import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "yuicry",
  description: "Музыка без лишнего",
};

const themeScript = `
try {
  var saved = localStorage.getItem("yuicry-theme");
  var light = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = saved || (light ? "light" : "dark");
} catch (error) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
