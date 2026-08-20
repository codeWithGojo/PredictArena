import type { Metadata } from "next";
import "./globals.css";

const fallbackUrl = "https://predictarena.imegufavour30.chatgpt.site";
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ||
  (productionHost ? `https://${productionHost}` : fallbackUrl);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "PredictArena",
  description:
    "Model-led match probabilities and knowledge tests across football, NBA, tennis, CODM Africa and EA FC Africa.",
  openGraph: {
    title: "PredictArena",
    description: "Know the game. Read the probability.",
    type: "website",
    url: siteUrl,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "PredictArena — Know the game. Read the probability.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PredictArena",
    description: "Know the game. Read the probability.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
