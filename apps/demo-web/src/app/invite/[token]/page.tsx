'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2, Mail, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [accepting, setAccepting] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    workspaceId?: string
  } | null>(null)

  useEffect(() => {
    // Auto-accept if user is already logged in
    if (status === 'authenticated' && !accepting && !result) {
      handleAccept()
    }
  }, [status])

  const handleAccept = async () => {
    setAccepting(true)
    try {
      const response = await fetch(`/api/invitations/${params.token}/accept`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: data.alreadyMember
            ? 'You are already a member of this workspace!'
            : 'Invitation accepted! Welcome to the team.',
          workspaceId: data.workspaceId,
        })

        // Redirect to workspace after 2 seconds
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 2000)
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to accept invitation',
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'An error occurred while accepting the invitation',
      })
    } finally {
      setAccepting(false)
    }
  }

  if (status === 'loading' || accepting) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Processing Invitation</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {status === 'loading' ? 'Checking your session...' : 'Accepting invitation...'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Workspace Invitation</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You've been invited to join a workspace. Please sign in to accept.
              </p>
            </div>
            <Button
              onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(`/invite/${params.token}`)}`)}
              className="w-full"
            >
              Sign In to Accept
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
              result.success ? 'bg-green-100 dark:bg-green-950' : 'bg-destructive/10'
            }`}>
              {result.success ? (
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-6 w-6 text-destructive" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold">
                {result.success ? 'Success!' : 'Unable to Accept'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.message}
              </p>
              {result.success && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Redirecting you to the workspace...
                </p>
              )}
            </div>
            {!result.success && (
              <div className="flex w-full gap-2">
                <Button
                  onClick={() => router.push('/')}
                  variant="outline"
                  className="w-full"
                >
                  Go Home
                </Button>
                <Button
                  onClick={handleAccept}
                  className="w-full"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  return null
}
