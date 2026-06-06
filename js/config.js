/* ==================================================================
   config.js
   Supabase connection settings + client. The publishable key is safe to expose.
   ================================================================== */

const SUPABASE_URL = "https://xdefnpyxusxueauohnlk.supabase.co";
const SUPABASE_KEY = "sb_publishable_GqLDf-ho0aCZ00q6wMhfhw_pk_GAYrN";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
