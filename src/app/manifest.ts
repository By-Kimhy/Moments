import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moments — លិខិតអញ្ជើញ និងសៀវភៅចំណងដៃ",
    short_name: "Moments",
    description: "លិខិតអញ្ជើញ ការឆ្លើយតប តុទទួលភ្ញៀវ និងសៀវភៅចំណងដៃ · Invitations, RSVPs, guest desk and gift book",
    lang: "km",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf5",
    theme_color: "#9b2c2c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "តុទទួលភ្ញៀវ · Guest desk", url: "/desk" }],
  };
}
