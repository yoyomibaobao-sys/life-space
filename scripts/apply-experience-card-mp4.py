from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


page_path = Path("app/experience-cards/[id]/page.tsx")
page = page_path.read_text(encoding="utf-8")
page = replace_once(
    page,
    'import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";\n',
    'import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";\n'
    'import ExperienceCardVideoPanel from "@/components/experience-card/ExperienceCardVideoPanel";\n',
    "experience card video import",
)
page = replace_once(
    page,
    '''      <section style={timelinePanelStyle}>\n        <ExperienceCardTimeline\n          archive={detail.archive}\n          records={detail.records}\n        />\n      </section>\n''',
    '''      <section style={timelinePanelStyle}>\n        <ExperienceCardTimeline\n          archive={detail.archive}\n          records={detail.records}\n        />\n      </section>\n\n      {isOwner ? (\n        <ExperienceCardVideoPanel detail={detail} />\n      ) : null}\n''',
    "experience card video panel",
)
page_path.write_text(page, encoding="utf-8")

panel_path = Path("components/experience-card/ExperienceCardVideoPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
panel = panel.replace(
    '  gridTemplateColumns: "minmax(190px, 280px) minmax(0, 1fr)",',
    '  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",',
    1,
)
panel_path.write_text(panel, encoding="utf-8")

tests_path = Path("tests/experience-cards.test.mjs")
tests = tests_path.read_text(encoding="utf-8")
video_test = r'''

test("experience cards generate a local looping H.264 MP4 with burned record text", async () => {
  const [detail, panel, renderer, packageJson] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
    source("package.json"),
  ]);

  assert.match(detail, /<ExperienceCardVideoPanel detail=\{detail\}/);
  assert.match(panel, /生成竖屏MP4/);
  assert.match(panel, /所有被选记录都会进入视频/);
  assert.match(panel, /原文字自动烧录为字幕/);
  assert.match(panel, /<video[\s\S]*?loop[\s\S]*?playsInline/);
  assert.match(panel, /navigator\.canShare/);
  assert.match(panel, /不上传云端，也不占云空间/);
  assert.match(panel, /repeat\(auto-fit/);

  assert.match(renderer, /new Mp4OutputFormat\(\{ fastStart: "in-memory" \}\)/);
  assert.match(renderer, /codec: "avc"/);
  assert.match(renderer, /EXPERIENCE_CARD_VIDEO_WIDTH = 720/);
  assert.match(renderer, /EXPERIENCE_CARD_VIDEO_HEIGHT = 1280/);
  assert.match(renderer, /splitExperienceCardVideoText\(record\.note\)/);
  assert.match(renderer, /detail\.records\.forEach/);
  assert.match(packageJson, /"mediabunny"/);
});
'''
if 'test("experience cards generate a local looping H.264 MP4' not in tests:
    tests += video_test
tests_path.write_text(tests, encoding="utf-8")

agents_path = Path("AGENTS.md")
agents = agents_path.read_text(encoding="utf-8")
old_rules = '''* MP4属于经验卡之后的独立阶段：所有被选记录都必须进入视频，原记录文字自动生成烧录字幕，输出静音H.264竖屏MP4，时长随记录数量和文字长度自动延长。\n* 当前不承诺无限服务器视频渲染，成本和合理用量应在真实使用后确定。'''
new_rules = '''* MP4第一版由经验卡作者在当前设备的浏览器中生成，不经过服务器渲染，不上传云端，也不计入用户可见容量。\n* 所有被选记录都必须进入视频；每条记录自动采用首张可用照片，没有照片时使用文字背景。原记录文字自动生成烧录字幕，长文字自动分段，时长随记录数量和文字长度延长。\n* 输出为静音H.264竖屏MP4；生成完成后在页面中循环预览，可直接调用设备文件分享或保存后上传到外部视频平台。\n* 当前不承诺无限服务器视频渲染；以后是否增加云端渲染、保存或合理用量限制，应根据真实使用和成本另行确定。'''
if old_rules in agents:
    agents = agents.replace(old_rules, new_rules, 1)
elif new_rules not in agents:
    raise SystemExit("experience card MP4 rules anchor not found")
agents_path.write_text(agents, encoding="utf-8")
