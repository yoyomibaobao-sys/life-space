import { redirect } from "next/navigation";

export default async function LegacyPublicUserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/user/${encodeURIComponent(id)}`);
}
