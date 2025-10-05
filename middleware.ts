// middleware.ts

// The middleware keeps the Supabase Auth session in sync between
// the browser and the server. When a request comes in, it checks
// if the user's auth token is expired and, if so, refreshes it.


import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|home|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
