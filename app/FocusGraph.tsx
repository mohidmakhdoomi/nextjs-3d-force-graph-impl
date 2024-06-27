'use client'

import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import { ForceGraphMethods } from "react-force-graph-3d";
// import origData from "./data";
// import { GetData } from "./DataGetter"
//import useSWR from 'swr'
 
//const fetcher = (...args) => fetch(...args).then((res) => JSON.parse(res))

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false
});

/*
const ForwardGraph3D = forwardRef(
  (props: ForceGraphProps, ref: MutableRefObject<ForceGraphMethods>) => (
    <ForceGraph3D {...props} ref={ref} />
  )
);
*/
function FocusGraph({
  data,
}: {
  data: string
}) {
  const fgRef = useRef<ForceGraphMethods>();
//  const { data, error } = useSWR(GetData(), fetcher)


  // console.log("client1", fgRef)
  
  //if (error) return <div>Failed to load</div>
  //if (!data) return <div>Loading...</div>

  //console.log("client1.5", data)
  
  let parsedData
  try {
    parsedData = JSON.parse(data)
  } catch(err) {
    let errorMessage
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    console.log(`-- JSON Parsing error --\n${err}\n-- Cause --\n${errorMessage}`)
    parsedData = {nodes: [], links: []}
  }
  
  // console.log("client2", parsedData["links"][5])

  const handleClick = useCallback(
    (node: any) => {
      const distance = 40;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      if (fgRef.current) {
        console.log(fgRef.current);
        fgRef.current.cameraPosition(
          {
            x: node.x * distRatio,
            y: node.y * distRatio,
            z: node.z * distRatio
          },
          node,
          3000
        );
      }
    },
    [fgRef]
  );  
  
  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={parsedData}
      onNodeClick={handleClick}
    />
  );
};

export default FocusGraph;

