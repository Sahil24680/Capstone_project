import { createClient } from '@supabase/supabase-js';

 //Creates an admin Supabase client with service role key.
 //Bypasses Row Level Security (RLS) for backend operations.
 //returns Supabase client with admin privileges


export function getAdminClient() {
  // TODO: Replace with actual implementation
  // Should set auth.persistSession = false
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false, //this is to prevent the session from being persisted in the database
      }
    }
  );
}




/*
?This was here before 

This will eventually connect to Supabase
export const dbClient = () => {
  throw new Error("dbClient not yet implemented");
};
*/