import type { Metadata } from "next";
import "./globals.css";

// TEMPORARY build probe: Google Fonts unreachable offline; restored after.
const geistSans = { variable: "" };
const geistMono = { variable: "" };

export const metadata: Metadata = {
  title: "Map Maker",
  description: "Map-making app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
