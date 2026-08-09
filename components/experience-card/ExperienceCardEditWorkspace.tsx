"use client";

import { useEffect, useState, type CSSProperties } from "react";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";

export default function ExperienceCardEditWorkspace({
  cardId,
  onCardSaved,
  onDirtyChange,
}: {
  cardId: string;
  onCardSaved?: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function handleSaved() {
    setDirty(false);
    onDirtyChange?.(false);
    setEditorRevision((value) => value + 1);
    await onCardSaved?.();
  }

  return (
    <div style={workspaceStyle}>
      <ExperienceCardEditor
        key={`${cardId}-${editorRevision}`}
        cardId={cardId}
        embedded
        compact
        showTitleField={false}
        onDirtyChange={(nextDirty) => {
          setDirty(nextDirty);
          onDirtyChange?.(nextDirty);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}

const workspaceStyle: CSSProperties = {
  marginTop: 10,
};
