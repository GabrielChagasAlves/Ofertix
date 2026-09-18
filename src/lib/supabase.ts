import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL não configurada.");
}

if (!supabasePublishableKey) {
  throw new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY não configurada."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);