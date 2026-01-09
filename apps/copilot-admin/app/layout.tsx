import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import {
  defaultLocale,
  localeTimezones,
  isValidLocale,
  getLanguageFromLocale,
  LOCALE_COOKIE_NAME,
  type Locale,
} from "@/i18n/request";

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
  title: "Copilot Admin",
  description: "Admin dashboard for Regulatory Intelligence Copilot",
};

/**
 * Load and merge translation messages for a given locale
 */
async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const language = getLanguageFromLocale(locale);

  // Load base language messages
  const baseMessages = await import(`@/translations/${language}.json`)
    .then((m) => m.default as Record<string, unknown>)
    .catch(() => ({}) as Record<string, unknown>);

  // Load regional overrides
  const regionMessages = await import(`@/translations/${locale}.json`)
    .then((m) => m.default as Record<string, unknown>)
    .catch(() => ({}) as Record<string, unknown>);

  // Merge: regional overrides take precedence
  return { ...baseMessages, ...regionMessages };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get locale from cookie or use default
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME);
  const locale: Locale =
    localeCookie?.value && isValidLocale(localeCookie.value)
      ? localeCookie.value
      : defaultLocale;

  // Load messages for the current locale
  const messages = await loadMessages(locale);
  const timeZone = localeTimezones[locale];

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers locale={locale} messages={messages} timeZone={timeZone}>
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
