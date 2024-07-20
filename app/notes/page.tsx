import { createClient } from '@/utils/supabase/server'
// import { test } from '@/lib/neo4j'
import TestPage from "./TestPageWrapper";

export default async function Page() {
  const supabase = createClient()
  const { data: notes } = await supabase.from('notes').select()

  console.log(JSON.stringify(notes, null, 2))
  return <TestPage /> //<pre>{JSON.stringify(notes, null, 2)}</pre>
}
