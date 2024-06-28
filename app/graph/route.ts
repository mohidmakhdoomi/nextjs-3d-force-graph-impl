import { NextResponse } from 'next/server'
import { read } from '@/lib/neo4j';

export async function GET(request: Request) {
  console.log(request)
  const links = await read(`
  MATCH (n)-[:INTERACTS1]->(m) RETURN n.name as source, m.name as target
  `)
  const ids = new Set()
  links?.forEach(l => {ids.add(l.source);ids.add(l.target);});
  const gData = { nodes: Array.from(ids).map(id => {return {id}}), links: links};
  
  return Response.json(gData);
}
