export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email;

    // ❗参数校验
    if (!email) {
      return NextResponse.json(
        { error: "缺少邮箱" },
        { status: 400 }
      );
    }

    // ❗获取用户列表
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // ❗判定是否存在
    const exists = data.users.some((u) => u.email === email);

    return NextResponse.json({ exists });
  } catch (err) {
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}