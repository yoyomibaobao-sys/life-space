import ProfileFeedbackEntry from "@/components/ProfileFeedbackEntry";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProfileFeedbackEntry />
      {children}
    </>
  );
}
