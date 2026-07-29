import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { site } from "@/content/site";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://niva-medicina-estetica.vercel.app"),
  title: {
    default: "NIVA Medicina Estética y Cosmiatría — Belgrano, CABA",
    template: "%s · NIVA Medicina Estética",
  },
  description:
    "NIVA Medicina Estética y Cosmiatría en Belgrano, CABA. Toxina botulínica, ácido hialurónico, dermapen con exosomas, radiofrecuencia y más. Reservá tu turno por WhatsApp.",
  keywords: [
    "medicina estética",
    "cosmiatría",
    "Belgrano",
    "CABA",
    "toxina botulínica",
    "ácido hialurónico",
    "dermapen",
    "exosomas",
    "radiofrecuencia",
  ],
  openGraph: {
    title: "NIVA Medicina Estética y Cosmiatría",
    description:
      "Tu piel, en las mejores manos. Medicina estética y cosmiatría en Belgrano, CABA.",
    type: "website",
    locale: "es_AR",
    siteName: site.fullName,
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${cormorant.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}
