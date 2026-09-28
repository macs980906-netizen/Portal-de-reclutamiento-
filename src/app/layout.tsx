import type { Metadata, Viewport } from "next";
import "@fontsource/anton/400.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asesores comerciales · RiderMex",
  description:
    "RiderMex busca asesores comerciales para sus agencias. Si sabes escuchar, recomendar y dar seguimiento, postúlate. No necesitas haber vendido motos.",
  robots: { index: true, follow: true },
  icons: { icon: "/brand/ridermex-logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
