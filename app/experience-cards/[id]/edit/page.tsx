import { Suspense } from "react";
import ExperienceCardEditWorkspace from "@/components/experience-card/ExperienceCardEditWorkspace";

export default async function EditExperienceCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>正在准备编辑内容...</main>}>
      <ExperienceCardEditWorkspace cardId={id} />
    </Suspense>
  );
}
