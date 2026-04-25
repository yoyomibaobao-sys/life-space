import { SummaryCard, eyebrowStyle, heroStyle, subtitleStyle, summaryWrapStyle, titleStyle } from "@/components/follow/FollowShared";

export default function FollowHero({
  projectCount,
  userCount,
}: {
  projectCount: number;
  userCount: number;
}) {
  return (
    <section style={heroStyle}>
      <div>
        <div style={eyebrowStyle}>持续追踪中心</div>
        <h1 style={titleStyle}>我的关注</h1>
        <div style={subtitleStyle}>查看你正在追踪的项目和用户最近发生了什么。</div>
      </div>

      <div style={summaryWrapStyle}>
        <SummaryCard label="关注项目" value={projectCount} />
        <SummaryCard label="关注用户" value={userCount} />
      </div>
    </section>
  );
}
