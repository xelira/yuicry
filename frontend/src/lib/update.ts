import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export type AppUpdate = {
  version: string;
  url: string;
};

function newer(remote: string, current: string) {
  const left = remote.split(".").map((part) => Number(part) || 0);
  const right = current.split(".").map((part) => Number(part) || 0);

  for (let index = 0; index < 3; index += 1) {
    const first = left[index] ?? 0;
    const second = right[index] ?? 0;
    if (first !== second) return first > second;
  }

  return false;
}

export async function checkUpdate(): Promise<AppUpdate | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const info = await App.getInfo();
    const response = await fetch("/api/version");
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.version || !data?.url) return null;
    if (!newer(data.version, info.version)) return null;
    if (localStorage.getItem("yuicry:update-dismissed") === data.version) return null;

    return { version: data.version, url: data.url };
  } catch (error) {
    return null;
  }
}
