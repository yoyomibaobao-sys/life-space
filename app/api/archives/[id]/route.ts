import { handleMoveToTrashRequest } from "@/lib/server/safe-trash-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return handleMoveToTrashRequest(request, "archive", id);
}
