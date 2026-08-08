import { redirect } from "next/navigation";

export default async function EditExperienceCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/experience-cards/${id}?edit=1`);
}
