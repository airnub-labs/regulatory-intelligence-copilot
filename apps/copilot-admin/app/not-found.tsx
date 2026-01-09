import Link from "next/link";
import { setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { defaultLocale } from "@/i18n/request";

export default function NotFound() {
  // Enable static rendering
  setRequestLocale(defaultLocale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Button asChild>
        <Link href="/">Go Home</Link>
      </Button>
    </div>
  );
}
