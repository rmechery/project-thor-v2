// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { type Database } from '@/types/supabase'

const supabaseBrowserClient = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: {
      params: {
        eventsPerSecond: -1,
      },
    },
  }
)

export { supabaseBrowserClient }