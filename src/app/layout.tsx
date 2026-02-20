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
  title: "VOKO — Korean Artist Community",
  description:
    "익명과 소셜이 공존하는 한국 아티스트 커뮤니티. 익명 게시판, 분야별 채널, 구인구직.",
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
