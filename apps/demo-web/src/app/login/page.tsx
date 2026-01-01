'use client'

import { useEffect, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'

import { AppHeader } from '@/components/layout/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const { status } = useSession()
  const router = useRouter()
  const demoEmail = process.env.NEXT_PUBLIC_SUPABASE_DEMO_EMAIL ?? 'demo.user@example.com'
  const demoPassword = process.env.NEXT_PUBLIC_SUPABASE_DEMO_PASSWORD ?? 'Password123!'

  const [email, setEmail] = useState(demoEmail)
  const [password, setPassword] = useState(demoPassword)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/')
    }
  }, [router, status])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/',
    })

    if (result?.error) {
      setError('Sign-in failed. Check your credentials and Supabase configuration.')
    } else {
      router.replace('/')
    }

    setIsSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/80 to-background">
      <AppHeader primaryAction={{ label: 'Home', href: '/' }} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <Card className="border bg-card/90 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LogIn className="h-5 w-5 text-primary" /> Sign in to continue
            </CardTitle>
            <CardDescription>
              Use the seeded Supabase demo credentials from your local stack to access the copilot. Default local
              credentials are {demoEmail} / {demoPassword} (from supabase/seed/demo_seed.sql).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder={demoEmail}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder={demoPassword}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
