"use client";

import { useRouter } from "next/navigation";

export default function CheckEmailPage() {
  const router = useRouter();

  return (
    <main
      style={{
        padding: 40,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 320, textAlign: "center" }}>
        <h1>请验证邮箱</h1>

        <p style={{ marginTop: 20, fontSize: 14, color: "#666" }}>
          注册成功，请前往邮箱点击验证链接后再进入系统
        </p>

        <button
          onClick={() => router.push("/login")}
          style={{
            marginTop: 30,
            padding: "10px 20px",
            background: "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          返回登录
        </button>
      </div>
    </main>
  );
}