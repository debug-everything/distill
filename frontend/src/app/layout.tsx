import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Lora, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Distill",
  description: "Personal AI Knowledge & Digest System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} ${sourceSerif.variable} antialiased`}
      >
        <Providers>
          <ThemeProvider>
            <Navbar />
            <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
            <Toaster position="bottom-right" richColors closeButton duration={5000} />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
