import { APP_CONFIG } from "@acme/config";
import { ThemeProvider, Toaster } from "@acme/ui";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { env } from "~/env";
import { ORPCReactProvider } from "~/orpc/react";

import "~/app/styles.css";

const geist = Geist({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production" ? APP_CONFIG.url : "http://localhost:3000",
  ),
  title: "СитРук — тренажёр ситуационного руководства",
  description:
    "Интерактивная деловая игра для тренировки управленческих разговоров.",
  openGraph: {
    title: "СитРук — тренажёр ситуационного руководства",
    description:
      "Интерактивная деловая игра для тренировки управленческих разговоров.",
    url: APP_CONFIG.url,
    siteName: APP_CONFIG.name,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={geist.variable}>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <ThemeProvider>
          <ORPCReactProvider>{props.children}</ORPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
