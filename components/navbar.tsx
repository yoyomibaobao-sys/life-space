import Link from "next/link";

export default function Navbar() {
  return (
    <nav style={{ padding: "20px", borderBottom: "1px solid #ddd" }}>
      <Link href="/discover" style={{ marginRight: "20px" }}>
        社区发现
      </Link>

      <Link href="/archive" style={{ marginRight: "20px" }}>
        我的养成
      </Link>

      <Link href="/exchange">
        交换
      </Link>
    </nav>
  );
}