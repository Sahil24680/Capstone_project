// utils/supabase/server.ts

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        // Read cookies from an incoming request 
        getAll() {
          return cookieStore.getAll() 
        },
        // Write cookies onto the response that may be blocked in Server Components
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options) 
            )
          } catch {
            // Safe to ignore because the Server Components can't set cookies directly.
            // Middleware will refresh and persist the session cookie.
          }
        },
      },
    }
  )
}