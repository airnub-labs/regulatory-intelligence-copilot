import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import {
  IconChartBar,
  IconDashboard,
  IconFileDescription,
  IconSettings,
} from "@tabler/icons-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { defaultLocale } from "@/i18n/request";

const quickLinks = [
  {
    title: "Dashboard",
    description: "View analytics and key metrics",
    href: "/dashboard",
    icon: IconDashboard,
  },
  {
    title: "Analytics",
    description: "Detailed usage and performance data",
    href: "/analytics",
    icon: IconChartBar,
  },
  {
    title: "Documents",
    description: "Manage regulatory documents",
    href: "/documents",
    icon: IconFileDescription,
  },
  {
    title: "Settings",
    description: "Configure system preferences",
    href: "/settings",
    icon: IconSettings,
  },
];

export default function HomePage() {
  // Enable static rendering
  setRequestLocale(defaultLocale);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Copilot Admin
        </h1>
        <p className="text-muted-foreground">
          Manage your Regulatory Intelligence Copilot from here.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <link.icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{link.title}</CardTitle>
                </div>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
