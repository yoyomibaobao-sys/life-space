"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";
import ProjectCategorySettingsView from "@/components/profile/ProjectCategorySettingsView";
import type { ArchiveCategory } from "@/lib/archive-categories";
import {
  DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  getCloudArchiveCategoryDepths,
  getLocalArchiveCategoryDepths,
  saveCloudArchiveCategoryDepths,
  saveLocalArchiveCategoryDepths,
  type ArchiveCategoryDepth,
  type ArchiveCategoryDepths,
  type ArchiveCategorySpace,
} from "@/lib/archive-category-settings";
import { buildLoginHref } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";

export default function ProjectCategorySettingsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const isEnglish = language === "en";
  const [userId, setUserId] = useState("");
  const [activeSpace, setActiveSpace] = useState<ArchiveCategorySpace>("cloud");
  const [cloudDepths, setCloudDepths] = useState<ArchiveCategoryDepths>({
    ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  });
  const [localDepths, setLocalDepths] = useState<ArchiveCategoryDepths>({
    ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        router.replace(buildLoginHref("/profile/project-categories"));
        return;
      }

      setUserId(user.id);
      setLocalDepths(getLocalArchiveCategoryDepths(user.id));

      try {
        const depths = await getCloudArchiveCategoryDepths(user.id);
        if (!cancelled) setCloudDepths(depths);
      } catch (loadError) {
        console.error("load archive category settings error:", loadError);
        if (!cancelled) {
          setError(isEnglish ? "Could not load cloud group settings." : "云空间分组设置加载失败。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isEnglish, router]);

  const activeDepths = activeSpace === "cloud" ? cloudDepths : localDepths;

  function updateDepth(category: ArchiveCategory, depth: ArchiveCategoryDepth) {
    const setter = activeSpace === "cloud" ? setCloudDepths : setLocalDepths;
    setter((current) => ({ ...current, [category]: depth }));
    setError("");
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError("");
    try {
      if (activeSpace === "cloud") {
        await saveCloudArchiveCategoryDepths(userId, cloudDepths);
      } else {
        saveLocalArchiveCategoryDepths(localDepths, userId);
      }
      showToast(isEnglish ? "Group settings saved" : "项目分组设置已保存");
    } catch (saveError) {
      console.error("save archive category settings error:", saveError);
      setError(isEnglish ? "Could not save group settings." : "项目分组设置保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProjectCategorySettingsView
      activeSpace={activeSpace}
      onSpaceChange={(space) => {
        setActiveSpace(space);
        setError("");
      }}
      depths={activeDepths}
      loading={loading}
      saving={saving}
      error={error}
      onToggleDepth={updateDepth}
      onSave={() => void save()}
    />
  );
}
