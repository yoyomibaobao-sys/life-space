import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>有间生活空间</h1>

      <p>记录一个被持续照顾的对象。</p>

      <h2>进入系统</h2>

      <ul>
        <li>
          <Link href="/discover">社区发现</Link>
        </li>

        <li>
          <Link href="/archive">我的养成</Link>
        </li>

        <li>
          <Link href="/exchange">交换</Link>
        </li>
      </ul>
    </main>
  );
}