'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Users, Mail, Shield, Calendar, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TeamMember {
  user_id: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'active' | 'suspended' | 'removed'
  joined_at: string
}

interface Tenant {
  tenant_id: string
  tenant_name: string
  tenant_type: string
}

export default function TeamSettingsPage() {
  const router = useRouter()
  const { status } = useSession()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'authenticated') {
      loadTeamData()
    }
  }, [status])

  async function loadTeamData() {
    try {
      const supabase = createClient()

      // Get current tenant info
      const { data: tenants } = await supabase.rpc('get_user_tenants')
      const activeTenant = tenants?.find((t: Tenant & { is_active: boolean }) => t.is_active)

      if (activeTenant) {
        setCurrentTenant(activeTenant)

        // Get team members for current tenant
        const { data: membersData, error } = await supabase
          .from('tenant_memberships')
          .select(`
            user_id,
            role,
            status,
            joined_at,
            user:user_id (
              email
            )
          `)
          .eq('tenant_id', activeTenant.tenant_id)
          .order('joined_at', { ascending: false })

        if (error) throw error

        // Transform data - Supabase returns nested relations as arrays
        const formattedMembers: TeamMember[] = (membersData || []).map((m) => {
          // Handle Supabase's array return type for relations
          const userRecord = m.user as unknown as { email?: string }[] | { email?: string } | null;
          const email = Array.isArray(userRecord)
            ? userRecord[0]?.email
            : userRecord?.email;
          return {
            user_id: m.user_id,
            email: email || 'Unknown',
            role: m.role as TeamMember['role'],
            status: m.status as TeamMember['status'],
            joined_at: m.joined_at,
          };
        })

        setMembers(formattedMembers)
      }
    } catch (error) {
      console.error('Failed to load team data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default'
      case 'admin': return 'secondary'
      case 'member': return 'outline'
      case 'viewer': return 'outline'
      default: return 'outline'
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default'
      case 'pending': return 'secondary'
      case 'suspended': return 'destructive'
      case 'removed': return 'destructive'
      default: return 'outline'
    }
  }

  if (status === 'unauthenticated') {
    router.push('/login')
    return null
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Settings</h1>
          <p className="text-muted-foreground">
            Manage members and permissions for {currentTenant?.tenant_name}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? 'member' : 'members'} in this workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No team members found
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{member.email}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Joined {new Date(member.joined_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(member.status)} className="capitalize">
                        {member.status}
                      </Badge>
                      <Badge variant={getRoleBadgeVariant(member.role)} className="flex items-center gap-1 capitalize">
                        <Shield className="h-3 w-3" />
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Workspace Name</span>
              <span className="font-medium">{currentTenant?.tenant_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Workspace Type</span>
              <span className="font-medium capitalize">{currentTenant?.tenant_type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Members</span>
              <span className="font-medium">{members.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Members</span>
              <span className="font-medium">
                {members.filter(m => m.status === 'active').length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
