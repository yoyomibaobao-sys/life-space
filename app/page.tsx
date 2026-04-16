import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>有时·耕作</h1>

      <p>记录每一株植物的生长过程。</p>

      <h2>进入系统</h2>

      <ul>
        <li>
          <Link href="/discover">社区发现</Link>
        </li>

        <li>
          <Link href="/archive">我的空间</Link>
        </li>

        <li>
          <Link href="/exchange">集市</Link>
        </li>
      </ul>
    </main>
  );
}