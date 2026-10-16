// Only call from the bundled Android document after the local database and
// migration have opened. Registration removal does not delete IndexedDB,
// localStorage, Cache Storage, or any project media.
export async function retireBundledLegacyServiceWorkers(
  serviceWorker: Pick<ServiceWorkerContainer, "getRegistrations"> | undefined =
    typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
  origin = typeof location === "undefined" ? "" : location.origin,
) {
  if (!serviceWorker || origin !== "https://life-space.uk") return { matched: 0, removed: 0 };
  const registrations = await serviceWorker.getRegistrations();
  const matching = registrations.filter((registration) => {
    try { return new URL(registration.scope).origin === origin; }
    catch { return false; }
  });
  const results = await Promise.all(matching.map((registration) => registration.unregister()));
  return { matched: matching.length, removed: results.filter(Boolean).length };
}
