import { handleSafeMarketMutation } from "@/lib/server/safe-market-media-request";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleSafeMarketMutation(request, "delete_post", id);
}
