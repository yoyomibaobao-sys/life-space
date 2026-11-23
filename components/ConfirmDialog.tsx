"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";

// Web and bundled Android use the same visual dialog and button semantics.
export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmText,
  cancelText,
  danger = false,
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AppConfirmDialog
      open={open}
      title={title}
      message={message}
      cancelLabel={cancelText || t.cancel}
      confirmLabel={confirmText || t.confirm}
      destructive={danger}
      confirmDisabled={confirmDisabled}
      cancelDisabled={cancelDisabled}
      onConfirm={onConfirm}
      onCancel={onClose}
    >
      {children}
    </AppConfirmDialog>
  );
}
