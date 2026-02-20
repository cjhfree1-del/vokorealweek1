import type { Metadata } from "next";
import { Space_Grotesk, VT323 } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vt323",
});

export const metadata: Metadata = {
  title: "VOKO — Firebase-first Artist Community MVP",
  description:
    "한국 아티스트 익명 커뮤니티 MVP. Firebase Auth, Firestore Rules, Cloud Functions 기반.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${spaceGrotesk.variable} ${vt323.variable}`}>
        {children}
      </body>
    </html>
  );
}
