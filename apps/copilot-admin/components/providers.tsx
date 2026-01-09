"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import {
  AdminViewProvider,
  getMockCurrentAdmin,
} from "@/lib/contexts/admin-view-context";
import { useAdminView } from "@/lib/contexts/admin-view-context";

interface ProvidersProps {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
  timeZone: string;
}

/**
 * Inner component to initialize admin context after providers are available
 */
function AdminInitializer({ children }: { children: React.ReactNode }) {
  const { setCurrentAdmin } = useAdminView();

  React.useEffect(() => {
    // In production, this would come from the auth session
    // For demo, use mock admin
    const currentAdmin = getMockCurrentAdmin();
    setCurrentAdmin(currentAdmin);
  }, [setCurrentAdmin]);

  return <>{children}</>;
}

export function Providers({ children, locale, messages, timeZone }: ProvidersProps) {
  return (
    <SessionProvider>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone}
      >
        <AdminViewProvider>
          <AdminInitializer>
            {children}
          </AdminInitializer>
        </AdminViewProvider>
      </NextIntlClientProvider>
    </SessionProvider>
  );
}
