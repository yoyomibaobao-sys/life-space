"use client";

import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { useEffect } from "react";

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

function isKeyboardEditable(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly;
  }

  if (target instanceof HTMLInputElement) {
    return (
      !target.disabled &&
      !target.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase())
    );
  }

  return target instanceof HTMLElement && target.isContentEditable;
}

export default function KeyboardLayoutGuard() {
  useEffect(() => {
    const root = document.documentElement;
    let disposed = false;
    let blurTimer = 0;
    let showListener: { remove: () => Promise<void> } | undefined;
    let hideListener: { remove: () => Promise<void> } | undefined;

    function markKeyboardOpen() {
      root.dataset.appKeyboardOpen = "true";
    }

    function markKeyboardClosed() {
      delete root.dataset.appKeyboardOpen;
    }

    function handleFocusIn(event: FocusEvent) {
      if (isKeyboardEditable(event.target)) {
        markKeyboardOpen();
      }
    }

    function handleFocusOut() {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (isKeyboardEditable(document.activeElement)) {
          markKeyboardOpen();
        } else {
          markKeyboardClosed();
        }
      }, 80);
    }

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    if (Capacitor.isNativePlatform()) {
      void Keyboard.addListener("keyboardDidShow", markKeyboardOpen).then(
        (handle) => {
          if (disposed) void handle.remove();
          else showListener = handle;
        },
      );
      void Keyboard.addListener("keyboardDidHide", markKeyboardClosed).then(
        (handle) => {
          if (disposed) void handle.remove();
          else hideListener = handle;
        },
      );
    }

    return () => {
      disposed = true;
      window.clearTimeout(blurTimer);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      markKeyboardClosed();
      if (showListener) void showListener.remove();
      if (hideListener) void hideListener.remove();
    };
  }, []);

  return null;
}
