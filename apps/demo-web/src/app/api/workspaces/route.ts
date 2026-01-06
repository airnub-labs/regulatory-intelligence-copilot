import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth/options'
import { getTenantContext } from '@/lib/auth/tenantContext'
import { createLogger } from '@reg-copilot/reg-intel-observability'

const logger = createLogger('WorkspacesAPI')

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { userId } = await getTenantContext(session)

    const body = await request.json()
    const { name, slug, type } = body

    if (!name || !slug || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, type' },
        { status: 400 }
      )
    }

    if (!['team', 'enterprise'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid workspace type. Must be "team" or "enterprise"' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseServiceKey, {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    })

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name,
        slug,
        type,
        owner_id: userId,
        plan: type === 'enterprise' ? 'enterprise' : 'pro',
      })
      .select()
      .single()

    if (tenantError) {
      logger.error({ error: tenantError, userId, name, slug, type }, 'Failed to create workspace')
      return NextResponse.json(
        { error: 'Failed to create workspace: ' + tenantError.message },
        { status: 500 }
      )
    }

    // Add owner membership
    const { error: membershipError } = await supabase
      .from('tenant_memberships')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
      })

    if (membershipError) {
      logger.error({ error: membershipError, userId, tenantId: tenant.id }, 'Failed to create membership')
      // Try to clean up the tenant if membership creation failed
      await supabase
        .from('tenants')
        .delete()
        .eq('id', tenant.id)

      return NextResponse.json(
        { error: 'Failed to create membership' },
        { status: 500 }
      )
    }

    logger.info({ userId, tenantId: tenant.id, name, type }, 'Workspace created successfully')

    return NextResponse.json({ tenant })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Request failed'
    logger.error({ error }, 'Failed to create workspace')
    return NextResponse.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
