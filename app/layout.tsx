import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Ductulator",
  description: "HVAC duct sizing, velocity, friction, and run loss calculator",
  applicationName: "Ductulator",

  openGraph: {
    title: "Ductulator",
    description: "HVAC duct sizing, velocity, friction, and run loss calculator",
    type: "website",
  },

  twitter: {
    card: "summary",
    title: "Ductulator",
    description: "HVAC duct sizing, velocity, friction, and run loss calculator",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#070707" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
