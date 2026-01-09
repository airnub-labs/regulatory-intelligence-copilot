import { redirect } from "next/navigation"

export default function SettingsPage() {
  // Redirect to the profile page by default
  redirect("/settings/profile")
}
