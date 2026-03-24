import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eidltoikfpnrzxruvawf.supabase.co";
const supabaseAnonKey = "sb_publishable_2cw-3WJnyD6x_CnPiDEiqQ_04violBa";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);