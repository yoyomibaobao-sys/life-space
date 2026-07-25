import { handleSafeMarketMutation } from "@/lib/server/safe-market-media-request";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleSafeMarketMutation(request, "set_cover", id);
}
