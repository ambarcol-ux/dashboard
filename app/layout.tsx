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
  title: "Ámbar Couture - ERP de Gestión",
  description: "Sistema centralizado de inventario, contratos y logística para Ámbar Couture.",
  icons: {
    icon: "https://ambarcouture.com/wp-content/uploads/2025/09/logo-ambar-e1761158401478.jpeg",
    apple: "https://ambarcouture.com/wp-content/uploads/2025/09/logo-ambar-e1761158401478.jpeg",
  },
  openGraph: {
    title: "Ámbar Couture - ERP de Gestión",
    description: "Sistema centralizado de inventario, contratos y logística para Ámbar Couture.",
    images: ["https://ambarcouture.com/wp-content/uploads/2025/09/logo-ambar-e1761158401478.jpeg"],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Ámbar Couture - ERP de Gestión",
    description: "Sistema centralizado de inventario, contratos y logística para Ámbar Couture.",
    images: ["https://ambarcouture.com/wp-content/uploads/2025/09/logo-ambar-e1761158401478.jpeg"],
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
