// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { type Database } from '@/types/supabase'
import { SupabaseClient } from '@supabase/supabase-js';

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

const signOut = async () => {
  await supabaseBrowserClient.auth.signOut();
};

const clearConversation = async (userId: string) => {
  await supabaseBrowserClient
    .from("conversations")
    .delete()
    .eq("user_id", userId)
    .throwOnError();
}

export { supabaseBrowserClient, signOut, clearConversation }