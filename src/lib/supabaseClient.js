import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhja3lzdGFpem1ndWJheXV3dHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMyMTAsImV4cCI6MjA5NDI2OTIxMH0.kTXm_Vk9cF8shEcUZxOch50eaV9AXNgsjaElGl_Ctqk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
})
