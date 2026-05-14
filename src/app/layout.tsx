import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MsalBootstrap } from "@/components/MsalBootstrap";
import { getRootLayoutStylesheetHref } from "@/lib/getRootLayoutStylesheetHref";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Everde AI Operations",
  description:
    "Executive portal for retail opportunity, sales plan review, freight analytics, and Teams communication.",
};

/** Avoids a Next 15 prerender bug on internal `/_not-found` in this environment. */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const globalCssHref = getRootLayoutStylesheetHref();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href={globalCssHref} />
      </head>
      <body className="min-h-full flex flex-col">
        <MsalBootstrap />
        {children}
      </body>
    </html>
  );
}
