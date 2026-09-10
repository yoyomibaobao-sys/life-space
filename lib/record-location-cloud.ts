import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRecordLocation, type RecordLocation } from "@/lib/record-location";
export async function readRecordLocations(client: Pick<SupabaseClient, "from">, recordIds: string[]) {
  const result = new Map<string, RecordLocation>();
  for (let offset = 0; offset < recordIds.length; offset += 200) {
    const { data, error } = await client.from("record_locations").select("record_id,label,latitude,longitude,source").in("record_id", recordIds.slice(offset, offset + 200));
    if (error) throw error;
    for (const row of data || []) { const location = normalizeRecordLocation(row); if (location) result.set(row.record_id, location); }
  }
  return result;
}
