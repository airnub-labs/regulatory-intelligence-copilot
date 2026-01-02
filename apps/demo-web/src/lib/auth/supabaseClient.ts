import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SUPABASE_REQUEST_TIMEOUT_MS = 10_000

function createTimedFetch(context: string) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error(`[${context}] Supabase request timed out`)), SUPABASE_REQUEST_TIMEOUT_MS)

    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`[${context}] Supabase request timed out`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export async function createSupabaseServerClient(supabaseUrl: string, supabaseKey: string, context: string) {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseKey, {
    global: { fetch: createTimedFetch(context) },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(allCookies) {
        allCookies.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })
}
