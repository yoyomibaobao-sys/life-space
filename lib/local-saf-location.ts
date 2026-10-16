/** Display an exact filesystem location only for a verified primary-storage SAF tree. */
export function formatVerifiedLocalDirectory(uri: string, language: string) {
  try {
    const parsed = new URL(uri);
    const treeId = /^\/tree\/([^/]+)$/.exec(parsed.pathname)?.[1];
    if (parsed.protocol === "content:" && parsed.hostname === "com.android.externalstorage.documents" && treeId) {
      const documentId = decodeURIComponent(treeId);
      if (documentId.startsWith("primary:")) {
        return `${language === "zh" ? "手机内部存储" : "Internal storage"}/${documentId.slice("primary:".length)}`;
      }
    }
  } catch { /* An opaque provider URI is still the exact authorized location. */ }
  return uri;
}
