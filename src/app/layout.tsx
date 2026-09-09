import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { PwaInstallPrompt } from "@/presentation/components/pwa/PwaInstallPrompt";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KYBERLIFE",
  description: "Personal Web Platform",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/images/logo-kyber-darkbg-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/logo-kyber-darkbg-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/images/logo-kyber-darkbg-180x180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KyberLife",
    // iOS PWA splash screens (portrait — the manifest is portrait-primary).
    startupImage: [
      { url: "/images/splash/apple-splash-1290-2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1179-2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1284-2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1170-2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1125-2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1242-2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-828-1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1242-2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-750-1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-640-1136.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-2048-2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1668-2388.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1640-2360.png", media: "(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1620-2160.png", media: "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/images/splash/apple-splash-1536-2048.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // App-like feel
  // Shrink the layout viewport when the soft keyboard opens so dvh-based sheets
  // (bottom drawers / full-screen sheets) track the space above the keyboard and
  // keep their sticky footer actions visible instead of being covered.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pinta el tema antes del primer frame.
            `next-themes` normalmente inyecta este script solo, pero
            `ThemeProvider` no lo monta hasta despues de hidratar —a proposito,
            para esquivar un desajuste de hidratacion en React 19— y con el se
            perdia lo unico que evita el parpadeo: la app abria en claro y
            saltaba a oscuro unos dos segundos despues.

            Se lee la misma clave de almacenamiento que usa `next-themes`, con
            su mismo defecto (`dark`) y su misma resolucion de `system`, para
            que cuando el provider monte se encuentre la clase ya puesta y no
            tenga nada que corregir. `<html>` lleva `suppressHydrationWarning`,
            asi que tocar su `class` aqui no le molesta a React. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,s=localStorage.getItem("theme")||"dark",t=s==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):s;d.classList.add(t);d.style.colorScheme=t}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased text-sm font-normal`} suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <PwaInstallPrompt />
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
