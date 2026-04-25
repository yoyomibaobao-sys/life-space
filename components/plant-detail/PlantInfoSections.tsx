import { Section, Card, TempCard, TextBlock } from "./PlantDetailShared";

export function EnvironmentSection({ environmentCards }: { environmentCards: { label: string; value: string }[] }) {
  if (environmentCards.length === 0) return null;

  return (
    <Section title="环境与场景">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginTop: 0,
        }}
      >
        {environmentCards.map((item) => (
          <Card key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </Section>
  );
}

export function TextGuideSection({
  title,
  text,
}: {
  title: string;
  text?: string | null;
}) {
  if (!text || !text.trim()) return null;
  return (
    <Section title={title}>
      <TextBlock text={text} />
    </Section>
  );
}

export function ParameterCardsSection({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string | null }[];
}) {
  const visibleItems = items.filter((item) => item.value);
  if (visibleItems.length === 0) return null;

  return (
    <Section title={title}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
        }}
      >
        {visibleItems.map((item) => (
          <Card key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </Section>
  );
}

export function TemperatureSection({
  items,
  note,
}: {
  items: { label: string; value: string | null }[];
  note?: string | null;
}) {
  const visibleItems = items.filter((item) => item.value);
  if (visibleItems.length === 0 && !note?.trim()) return null;

  return (
    <Section title="温度节点">
      {visibleItems.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {visibleItems.map((item) => (
            <TempCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      )}

      {note?.trim() && (
        <div style={{ marginTop: 12, color: "#555", fontSize: 15, lineHeight: 1.9 }}>{note}</div>
      )}
    </Section>
  );
}

export function PhotoperiodSection({
  items,
  note,
}: {
  items: { label: string; value: string | null }[];
  note?: string | null;
}) {
  const visibleItems = items.filter((item) => item.value);
  if (visibleItems.length === 0 && !note?.trim()) return null;

  return (
    <Section title="光周期">
      {visibleItems.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {visibleItems.map((item) => (
            <Card key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      )}

      {note?.trim() && (
        <div style={{ marginTop: 12, color: "#555", fontSize: 15, lineHeight: 1.9 }}>{note}</div>
      )}
    </Section>
  );
}
