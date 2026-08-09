import {
  SummaryCard,
  heroStyle,
  summaryWrapStyle,
  titleStyle,
} from "@/components/follow/FollowShared";

export default function FollowHero({
  projectCount,
  userCount,
}: {
  projectCount: number;
  userCount: number;
}) {
  return (
    <section style={heroStyle}>
      <h1 style={{ ...titleStyle, marginTop: 0 }}>关注</h1>

      <div style={summaryWrapStyle}>
        <SummaryCard label="关注项目" value={projectCount} />
        <SummaryCard label="关注用户" value={userCount} />
      </div>
    </section>
  );
}
