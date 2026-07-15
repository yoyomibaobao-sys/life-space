import { handleSafeDeleteRequest } from "@/lib/server/safe-delete-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return handleSafeDeleteRequest(request, "media", id);
}
