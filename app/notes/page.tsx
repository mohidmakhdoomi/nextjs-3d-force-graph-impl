import { createClient } from '@/utils/supabase/server'
// import { test } from '@/lib/neo4j'
// import TestPage from "./TestPageWrapper";

export default async function Page() {
  const supabase = createClient()
  const { data: notes } = await supabase.from('notes').select()

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}
