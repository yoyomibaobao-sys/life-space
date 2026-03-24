import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    "https://eidltoikfpnrzxruvawf.supabase.co",
    "sb_publishable_2cw-3WJnyD6x_CnPiDEiqQ_04violBa",
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}