import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const fallbackUrl = "https://predictarena.imegufavour30.chatgpt.site";
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ||
  (productionHost ? `https://${productionHost}` : fallbackUrl);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "PredictArena | Sports Intelligence",
  description:
    "Transparent match probabilities, model confidence and performance tracking across football, basketball and tennis.",
  openGraph: {
    title: "PredictArena | Sports Intelligence",
    description: "Read the probability. See the evidence.",
    type: "website",
    url: siteUrl,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "PredictArena sports intelligence dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PredictArena | Sports Intelligence",
    description: "Read the probability. See the evidence.",
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
      <body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
