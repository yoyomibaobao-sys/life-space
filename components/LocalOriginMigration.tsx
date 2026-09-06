"use client";

import { useEffect } from "react";
import { migrateLegacyLocalOrigin } from "@/lib/local-origin-migration";

export default function LocalOriginMigration() {
  useEffect(() => {
    void migrateLegacyLocalOrigin().catch((error) => {
      // Migration is deliberately retryable and must never block the cloud UI.
      console.warn("local origin migration deferred", error);
    });
  }, []);

  return null;
}
