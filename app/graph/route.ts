import { read } from '@/lib/neo4j';

export async function GET() {
  let links = await read(`
  MATCH (u:User)-[p:PROVIDED]->(a:Answer) RETURN u.display_name as source, a.link as target
  `)
  if (links === undefined) {
    links = []
  }
  const ids = new Set()
  links.forEach(l => {ids.add(l.source);ids.add(l.target);});
  const gData = { nodes: Array.from(links).flatMap((id) => [{"id":id.source, "group":1},{"id":id.target, "group":2}]), links: links};
  return Response.json(gData);
}
