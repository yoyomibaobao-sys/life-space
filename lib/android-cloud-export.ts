import { Capacitor, registerPlugin } from "@capacitor/core";

export type CloudExportEstimate = {
  projects: number; cycles: number; records: number; media: number; sizeBytes: number;
};
export type CloudExportRequest = {
  origin: string; supabaseUrl: string; accessToken: string; timeZone: string;
};
export type CloudExportSaved = { cancelled: boolean; sizeBytes?: number; sha256?: string };

type NativeCloudExport = {
  estimate(options: CloudExportRequest): Promise<CloudExportEstimate>;
  save(options: CloudExportRequest): Promise<CloudExportSaved>;
};
const nativeExport = registerPlugin<NativeCloudExport>("CloudExport");
const productionSupabase = "https://eidltoikfpnrzxruvawf.supabase.co";
const productionOrigin = "https://life-space.uk";

export function resolveMatchingCloudOrigin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const origin = process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
  if (!supabaseUrl || !origin) throw new Error("matching_export_service_required");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) {
    throw new Error("invalid_export_origin");
  }
  if (supabaseUrl !== productionSupabase && origin === productionOrigin) {
    throw new Error("qa_export_to_production_rejected");
  }
  return { origin, supabaseUrl };
}

export function cloudExportRequest(accessToken: string, timeZone: string): CloudExportRequest {
  if (!Capacitor.isNativePlatform()) throw new Error("native_export_required");
  if (!accessToken) throw new Error("matching_export_service_required");
  const { origin, supabaseUrl } = resolveMatchingCloudOrigin();
  return { origin, supabaseUrl, accessToken, timeZone };
}

export async function estimateAndroidCloudExport(request: CloudExportRequest): Promise<CloudExportEstimate> {
  const value = await nativeExport.estimate(request);
  if (![value.projects, value.cycles, value.records, value.media, value.sizeBytes]
    .every((number) => Number.isSafeInteger(number) && number >= 0)) {
    throw new Error("invalid_export_estimate");
  }
  return value;
}

export function saveAndroidCloudExport(request: CloudExportRequest): Promise<CloudExportSaved> {
  return nativeExport.save(request);
}
