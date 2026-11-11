import { createClient } from '@supabase/supabase-js';

// Configuration Supabase pour Dopamine.gg
const SUPABASE_URL = 'https://labnalbbrdsuwszwiigv.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhYm5hbGJicmRzdXdzendpaWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzOTk0NDgsImV4cCI6MjEwOTk3NTQ0OH0.EUDE0gBJnJ1NanyZPf9x1M0X-s6o5wF27nSYFDxevJU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
