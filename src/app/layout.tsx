import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "First Pass — how AI screeners read your CV",
  description:
    "Upload your CV and a job listing. Claude and GPT screen it like an ATS, then tell you what to fix first.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
