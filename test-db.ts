import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dfqvgezjhudmnlyeycju.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  try {
    const { data, error } = await client.from("profiles").select("id, full_name, is_admin");
    if (error) {
      console.error("Error fetching profiles:", error);
    } else {
      console.log("All profiles:", data);
    }
  } catch (err) {
    console.error("Exception:", err);
  }
}

run();
