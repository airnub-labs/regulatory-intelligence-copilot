import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { LoginForm } from "@/components/login-form";
import { defaultLocale } from "@/i18n/request";

export default function LoginPage() {
  // Enable static rendering
  setRequestLocale(defaultLocale);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
