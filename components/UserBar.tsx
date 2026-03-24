"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function UserBar() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email || "");
      }
    }

    getUser();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "20px",
        borderBottom: "1px solid #eee",
        paddingBottom: "10px",
      }}
    >
      <div>👤 {email}</div>

      <button
        onClick={handleLogout}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#888",
        }}
      >
        登出
      </button>
    </div>
  );
}