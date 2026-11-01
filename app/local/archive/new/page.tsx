"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Legacy local-create URLs remain safe bookmarks, but the online product is cloud-only.
// Preserve the query string so category, species and quick-capture context reaches cloud creation.
export default function NewLocalArchivePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/archive/new" + window.location.search);
  }, [router]);

  return null;
}
