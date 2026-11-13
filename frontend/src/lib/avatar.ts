export function avatarSource(url: string) {
  if (!url) return "";
  return `/api/avatar?url=${encodeURIComponent(url)}`;
}
