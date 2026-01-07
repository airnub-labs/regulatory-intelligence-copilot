// apps/demo-web/src/app/api/test-tenant-context/route.ts
// Test API route to verify tenant context functionality

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const context = await getTenantContext(session);

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 401 }
    );
  }
}
