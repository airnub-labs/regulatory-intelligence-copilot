import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth/options'

const handler: any = (NextAuth as unknown as (options: typeof authOptions) => unknown)(authOptions)

export const GET = handler
export const POST = handler
