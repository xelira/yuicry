export async function shareLink(title: string, path: string) {
  const url = new URL(path, window.location.origin).href;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url });
      return true;
    } catch (error) {
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    return false;
  }
}
