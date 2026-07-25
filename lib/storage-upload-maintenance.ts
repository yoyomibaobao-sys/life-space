import { supabase } from "@/lib/supabase";

export const STORAGE_UPLOAD_MAINTENANCE_MESSAGE =
  "图片上传功能正在维护，文字内容仍可正常保存，请稍后再试。";

export const STORAGE_UPLOAD_MAINTENANCE_TEXT_SAVED_MESSAGE =
  "文字内容已保存，图片上传功能正在维护，请稍后再补充图片。";

export const STORAGE_UPLOAD_MAINTENANCE_RECORD_NOT_SAVED_MESSAGE =
  "图片上传功能正在维护，本次记录尚未保存。如需先保存文字，请移除图片后重试。";

export const STORAGE_UPLOAD_MAINTENANCE_MARKET_NOT_SAVED_MESSAGE =
  "图片上传功能正在维护，本次集市发布尚未保存，请稍后再试。";

export const STORAGE_UPLOAD_MAINTENANCE_SYNC_NOT_STARTED_MESSAGE =
  "图片上传功能正在维护，本次转到云空间尚未开始，本地内容仍完整保留，请稍后再试。";

export const STORAGE_UPLOAD_MAINTENANCE_SYNC_MESSAGE =
  "项目和文字内容已同步，图片上传功能正在维护，请稍后重新同步图片。";

function isMissingMaintenanceRpc(error: {
  code?: string;
  message?: string;
} | null) {
  if (!error) return false;

  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /is_storage_upload_accepting|schema cache|function .* does not exist/i.test(
      error.message || ""
    )
  );
}

/**
 * This compatibility check is deployed before the maintenance migration.
 * A missing RPC therefore means the upload window has not started yet.
 * Unexpected read failures must not turn into a false maintenance banner.
 */
export async function isStorageUploadMaintenance() {
  const { data, error } = await supabase.rpc("is_storage_upload_accepting");

  if (error) {
    if (!isMissingMaintenanceRpc(error)) {
      console.error("read storage upload maintenance state error:", error);
    }
    return false;
  }

  return data === false;
}
