"use client";

import { useRouter } from "next/navigation";
import AndroidProfileInfoPage from "@/components/profile/AndroidProfileInfoPage";

export default function ProfileDataSecurityPage() {
  const router = useRouter();
  return (
    <AndroidProfileInfoPage
      kind="data-security"
      online
      signedIn
      onBack={() => router.push("/profile")}
      onNavigate={(path) => router.push(path)}
    />
  );
}
