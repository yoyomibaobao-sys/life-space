"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";
import { fetchGuardedRecordImage, guardedRecordImagePath } from "@/lib/guarded-record-image.mjs";

export function useGuardedRecordImage(source?: string) {
  const guardedPath = Capacitor.isNativePlatform() ? null : guardedRecordImagePath(source);
  const [loaded, setLoaded] = useState<{ path: string; url: string }>();

  useEffect(() => {
    if (!guardedPath) return;
    let ownerId: string | null | undefined;
    let request: AbortController | undefined;
    let objectUrl: string | undefined;

    function release() {
      request?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextOwnerId = session?.user.id ?? null;
      if (nextOwnerId === ownerId) return;
      ownerId = nextOwnerId;
      release();
      setLoaded(undefined);

      const nextRequest = new AbortController();
      request = nextRequest;
      void fetchGuardedRecordImage(guardedPath, session?.access_token, nextRequest.signal)
        .then((blob) => {
          if (!blob || nextRequest.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ path: guardedPath, url: objectUrl });
        })
        .catch(() => {
          // Leave the image empty on network failure or cancellation.
        });
    });

    return () => {
      subscription.unsubscribe();
      release();
    };
  }, [guardedPath]);

  if (!guardedPath) return source;
  return loaded?.path === guardedPath ? loaded.url : undefined;
}
