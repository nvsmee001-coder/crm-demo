import type { Metadata } from "next";
import "./globals.css";
import "./customers.css";
import "./customer-profile.css";
import "./telesales.css";
import "./access.css";
import "./glass-theme.css";
import "./glass-customers.css";
import "./glass-team.css";
import "./glass-welcome.css";
import "./brand.css";
import "./customer-import.css";
import "./customer-distribution.css";
import "./auth.css";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "SMEE agency · CRM & Vận hành",
  description: "Không gian quản lý khách hàng, bán hàng, dự án và sản xuất nội dung của SMEE agency.",
  icons: {
    icon: "/brand/smee-favicon.svg",
    shortcut: "/brand/smee-favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
