import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.owaw.yuicry",
  appName: "yuicry",
  webDir: "out",
  backgroundColor: "#0b0b0d",
  appendUserAgent: "yuicry/1.1.3",
  server: {
    url: "https://yuicry.owaw.online/login/",
    cleartext: false,
    allowNavigation: ["yuicry.owaw.online", "owaw.ru", "*.owaw.ru"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b0b0d",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "DARK",
      hidden: false,
    },
  },
};

export default config;
