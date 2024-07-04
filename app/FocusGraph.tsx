'use client'

import { useCallback, useRef } from "react";
import ForceGraph3D, { ForceGraphMethods } from "react-force-graph-3d";
// import origData from "./data";
// import { GetData } from "./DataGetter"
//import useSWR from 'swr'
 
//const fetcher = (...args) => fetch(...args).then((res) => JSON.parse(res))


function FocusGraph({
  data,
}: {
  data: string
}) {
  const fgRef = useRef<ForceGraphMethods>();
  
  let parsedData
  try {
    parsedData = JSON.parse(data)
  } catch(err) {
    let errorMessage
    if (err instanceof Error) {
      errorMessage = err.cause;
    }
    console.log(`-- JSON Parsing error --\n${err}\n-- Cause --\n${errorMessage}`)
    parsedData = {nodes: [], links: []}
  }

  // console.log("client2", parsedData["links"][5])
  const handleClick = useCallback(
    (node: any) => {
      const distance = 40;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      if (fgRef.current !== undefined) {
        // fgRef.current.getGraphBbox()
        // const distMult = Math.sqrt((node.x - fgRef.current.camera().x)**2 + (node.y - fgRef.current.camera().y)**2 + (node.z - fgRef.current.camera().z)**2)
        fgRef.current.cameraPosition(
            {x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio}, // new position
            node, // lookAt ({ x, y, z })
            3000  // ms transition duration
        );
      }
    },
    [fgRef]
  );  
  
  return <ForceGraph3D
      ref={fgRef}
      graphData={parsedData}
      nodeLabel="id"
      nodeAutoColorBy="group"
      nodeResolution={64}
      onNodeClick={handleClick}
    />;
}

export default FocusGraph;

