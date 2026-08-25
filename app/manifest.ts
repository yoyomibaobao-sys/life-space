import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "有时·耕作 | LifeSpace for Cultivation",
    short_name: "有时·耕作",
    description: "一个围绕耕作展开的长期记录空间。",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f3",
    theme_color: "#f6f8f3",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/brand/youshi-space-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/youshi-space-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
