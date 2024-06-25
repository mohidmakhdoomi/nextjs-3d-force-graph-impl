import { createClient } from '@/utils/supabase/server'
import { test } from '@/lib/neo4j'

export default async function Page() {
  const supabase = createClient()
  const testing = await test()
  console.log(testing)
  const { data: notes } = await supabase.from('notes').select()

  return <pre>{JSON.stringify(notes, null, 2)}</pre>
}
