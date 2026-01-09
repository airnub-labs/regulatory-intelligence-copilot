import { getRequestConfig } from "next-intl/server";

// Supported locales (BCP 47 language-REGION format) - all 10 required locales
export const locales = [
  "en-IE", // English (Ireland) - Default
  "en-GB", // English (United Kingdom)
  "en-US", // English (United States)
  "ga-IE", // Irish (Ireland)
  "es-ES", // Spanish (Spain)
  "fr-FR", // French (France)
  "fr-CA", // French (Canada)
  "de-DE", // German (Germany)
  "pt-PT", // Portuguese (Portugal)
  "pt-BR", // Portuguese (Brazil)
] as const;

export type Locale = (typeof locales)[number];

// Default locale for the application
export const defaultLocale: Locale = "en-IE";

// Cookie name for storing user's locale preference
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

// Locale display names (for UI)
export const localeDisplayNames: Record<Locale, string> = {
  "en-IE": "English (Ireland)",
  "en-GB": "English (UK)",
  "en-US": "English (US)",
  "ga-IE": "Gaeilge (Ireland)",
  "es-ES": "Espa\u00f1ol (Spain)",
  "fr-FR": "Fran\u00e7ais (France)",
  "fr-CA": "Fran\u00e7ais (Canada)",
  "de-DE": "Deutsch (Germany)",
  "pt-PT": "Portugu\u00eas (Portugal)",
  "pt-BR": "Portugu\u00eas (Brazil)",
};

// Locale to currency mapping (ISO 4217)
export const localeCurrencies: Record<Locale, string> = {
  "en-IE": "EUR",
  "en-GB": "GBP",
  "en-US": "USD",
  "ga-IE": "EUR",
  "es-ES": "EUR",
  "fr-FR": "EUR",
  "fr-CA": "CAD",
  "de-DE": "EUR",
  "pt-PT": "EUR",
  "pt-BR": "BRL",
};

// Locale to timezone mapping (IANA)
export const localeTimezones: Record<Locale, string> = {
  "en-IE": "Europe/Dublin",
  "en-GB": "Europe/London",
  "en-US": "America/New_York",
  "ga-IE": "Europe/Dublin",
  "es-ES": "Europe/Madrid",
  "fr-FR": "Europe/Paris",
  "fr-CA": "America/Toronto",
  "de-DE": "Europe/Berlin",
  "pt-PT": "Europe/Lisbon",
  "pt-BR": "America/Sao_Paulo",
};

/**
 * Extract the base language code from a BCP 47 locale
 * @example getLanguageFromLocale("en-IE") => "en"
 */
export function getLanguageFromLocale(locale: Locale): string {
  return locale.split("-")[0];
}

/**
 * Extract the region code from a BCP 47 locale
 * @example getRegionFromLocale("en-IE") => "IE"
 */
export function getRegionFromLocale(locale: Locale): string {
  return locale.split("-")[1];
}

/**
 * Check if a string is a valid locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

/**
 * Load and merge translation messages
 * Base language file (e.g., en.json) is merged with regional overrides (e.g., en-IE.json)
 * Regional values take precedence over base values
 */
async function loadMessages(
  locale: Locale
): Promise<Record<string, string>> {
  const language = getLanguageFromLocale(locale);

  // Load base language messages (e.g., "en.json")
  const baseMessages = await import(`../translations/${language}.json`)
    .then((m) => m.default as Record<string, string>)
    .catch(() => ({}) as Record<string, string>);

  // Load regional overrides (e.g., "en-IE.json")
  const regionMessages = await import(`../translations/${locale}.json`)
    .then((m) => m.default as Record<string, string>)
    .catch(() => ({}) as Record<string, string>);

  // Merge: regional overrides take precedence
  return { ...baseMessages, ...regionMessages };
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Use the locale from the request, or fall back to default
  const requestedLocale = await requestLocale;
  const locale = isValidLocale(requestedLocale ?? "")
    ? requestedLocale as Locale
    : defaultLocale;

  const messages = await loadMessages(locale);

  return {
    locale,
    messages,
    // Timezone for date formatting
    timeZone: localeTimezones[locale],
    // ICU MessageFormat number and date formats
    formats: {
      number: {
        // Default currency format using locale's currency
        currency: {
          style: "currency",
          currency: localeCurrencies[locale],
        },
        // Compact notation for large numbers (1.2K, 1.5M)
        compact: {
          notation: "compact",
          compactDisplay: "short",
        },
        // Percentage with no decimals
        percent: {
          style: "percent",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        },
        // Percentage with decimals
        percentPrecise: {
          style: "percent",
          minimumFractionDigits: 1,
          maximumFractionDigits: 2,
        },
        // Integer (no decimals)
        integer: {
          maximumFractionDigits: 0,
        },
        // Decimal with 2 places
        decimal: {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
      dateTime: {
        // Short date: 25/12/2024
        short: {
          day: "numeric",
          month: "numeric",
          year: "numeric",
        },
        // Medium date: 25 Dec 2024
        medium: {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
        // Long date: 25 December 2024
        long: {
          day: "numeric",
          month: "long",
          year: "numeric",
        },
        // Full date: Wednesday, 25 December 2024
        full: {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        },
        // Time only: 14:30
        time: {
          hour: "numeric",
          minute: "numeric",
          hour12: false,
        },
        // Time with seconds: 14:30:45
        timeWithSeconds: {
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: false,
        },
        // Date and time: 25 Dec 2024, 14:30
        dateTime: {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: false,
        },
        // Relative time formatting is handled via useFormatter().relativeTime()
      },
      list: {
        // Conjunction list: A, B, and C
        conjunction: {
          style: "long",
          type: "conjunction",
        },
        // Disjunction list: A, B, or C
        disjunction: {
          style: "long",
          type: "disjunction",
        },
        // Unit list: A, B, C
        unit: {
          style: "narrow",
          type: "unit",
        },
      },
    },
    // Handle errors gracefully during static generation
    onError(error) {
      // Suppress known non-critical errors during builds
      if (
        error.code !== "ENVIRONMENT_FALLBACK" &&
        error.code !== "MISSING_MESSAGE"
      ) {
        console.error("[next-intl]", error);
      }
    },
    // Fallback for missing messages - return the key
    getMessageFallback({ key, namespace }) {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      if (process.env.NODE_ENV === "development") {
        console.warn(`[next-intl] Missing translation: ${fullKey}`);
      }
      return fullKey;
    },
  };
});
