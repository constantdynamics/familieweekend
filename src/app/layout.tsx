import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { ProefBalk } from "@/components/proef/ProefBalk";
import { AppSignalen } from "@/components/pwa/AppSignalen";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/shared/platform";
import { siteUrl } from "@/lib/shared/site";
import { iosStartupImages } from "@/lib/shared/splash";
import "./globals.css";

/*
 * Display letter: Sansita Swashed ExtraBold, the only cut we use. It is
 * declared for every weight, so the browser never fakes a bolder version.
 */
const sansitaSwashed = localFont({
  src: "./fonts/sansita-swashed-latin-800.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sansita",
  fallback: ["Arial Black", "serif"],
});

/** Text letter: Nunito, variable from 200 to 1000. */
const nunito = localFont({
  src: "./fonts/nunito-latin-variable.woff2",
  weight: "200 1000",
  display: "swap",
  variable: "--font-nunito",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

/**
 * The year in the wordmark: Yellowtail, as a subset with only the digits
 * (2 kB). "block", because a year in a fallback letter would look odd and
 * the file is there almost at once.
 */
const yellowtail = localFont({
  src: "./fonts/yellowtail-cijfers.woff2",
  weight: "400",
  display: "block",
  variable: "--font-yellowtail",
  fallback: ["cursive"],
  adjustFontFallback: false,
});

const NAME = "De Valkenburger Spelen 2027";
const DESCRIPTION = "Het familieweekend vol spelletjes: quiz, zeskamp en prijsuitreiking. Hemelvaart 2027.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: NAME, template: `%s · ${NAME}` },
  description: DESCRIPTION,
  applicationName: "Valk Spelen",
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    title: "Valk Spelen",
    statusBarStyle: "black-translucent",
    startupImage: iosStartupImages(),
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    title: NAME,
    description: "Hemelvaart, do 6 t/m zo 9 mei 2027. Open de link en vul de familiecode in.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Het embleem van De Valkenburger Spelen: een valk in een lauwerkrans" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2B1810",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${sansitaSwashed.variable} ${nunito.variable} ${yellowtail.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>
        <a
          href="#inhoud"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-pil focus:bg-mosterd focus:px-4 focus:py-2 focus:font-bold focus:text-studio"
        >
          Naar de inhoud
        </a>
        <Suspense fallback={null}>
          <ProefBalk />
        </Suspense>
        {children}
        <AppSignalen swEnabled={process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SW !== "off"} />
      </body>
    </html>
  );
}
