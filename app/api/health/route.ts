export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
