import { setRequestLocale } from "next-intl/server";

import { defaultLocale } from "@/i18n/request";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Enable static rendering
  setRequestLocale(defaultLocale);

  // Login page has a minimal layout without sidebar
  return <>{children}</>;
}
