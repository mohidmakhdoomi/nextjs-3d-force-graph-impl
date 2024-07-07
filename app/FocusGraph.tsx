'use client'

import {useCallback, useEffect, useRef, useState} from "react";
import ForceGraph3D, {ForceGraphMethods} from "react-force-graph-3d";
// import {ForceGraph3DGenericInstance, ForceGraph3DInstance} from "3d-force-graph";
// import { Vector3 } from '@react-three/fiber';
// import * as THREE from 'three';
import {PerspectiveCamera} from "three";
import {OrbitControls} from "three-stdlib";
// import {forceLink} from "d3-force-3d/src";
// import dynamic from "next/dynamic";
// import origData from "./data";
// import { GetData } from "./DataGetter"
// import useSWR from 'swr'

// const fetcher = (...args) => fetch(...args).then((res) => JSON.parse(res))

const d3 = require('d3-force-3d')

function FocusGraph({data,}: { data: string }) {
    const fgRef = useRef<ForceGraphMethods>();
    // let Graph: any;

    let parsedData: any
    try {
        parsedData = JSON.parse(data)
    } catch (err) {
        let errorMessage
        if (err instanceof Error) {
            errorMessage = err.cause;
        }
        console.log(`-- JSON Parsing error --\n${err}\n-- Cause --\n${errorMessage}`)
        parsedData = {nodes: [], links: []}
    }

    const [graphData, setGraphData] = useState({nodes: [], links: []});

    // const rotateTimer = useRef<NodeJS.Timeout>();
    // const angle = useRef<number>(0);
    const [isRotationActive, setIsRotationActive] = useState<boolean>(true);

    // const cameraX = useRef<number>(0);
    // const cameraY = useRef<number>(0);
    // const cameraZ = useRef<number>(7500);

    const nodes = parsedData.nodes.map((node: any) => ({
        id: node.id,
        group: node.group,
        // x: Math.random(),
        // y: Math.random(),
        // z: Math.random(),
        // vx: (Math.random() * 2) - 1,
        // vy: (Math.random() * 2) - 1,
        // vz: (Math.random() * 2) - 1,
    }));

    parsedData = {nodes: nodes, links: parsedData.links};

    function rotate() {
        // cameraX.current = fgRef.current?.camera().position?.x!
        // cameraY.current = fgRef.current?.camera().position?.y!
        // cameraZ.current = fgRef.current?.camera().position?.z!
        // angle.current = 0
        // console.log(`angle ${angle.current}: x = ${cameraX.current}, y = ${cameraY.current}, z = ${cameraZ.current}`);
        // fgRef.current?.cameraPosition({
        //     x: cameraX.current,
        //     y: cameraY.current, // * Math.cos(angle.current),
        //     z: cameraZ.current
        // }, {x:0,y:0,z:0});
        const threeControls = fgRef.current?.controls() as OrbitControls;
        threeControls.autoRotate = true
        threeControls.update()
        // rotateTimer.current = setInterval(() => {
        //     fgRef.current?.cameraPosition({
        //         x: cameraX.current * Math.sin(angle.current),
        //         y: cameraY.current, // * Math.cos(angle.current),
        //         z: cameraZ.current * Math.cos(angle.current)
        //     }, {x:0,y:0,z:0});
        //     angle.current += (Math.PI / 300)
        // }, 10);
    }

    function disableRotate() {
        const threeControls = fgRef.current?.controls() as OrbitControls;
        threeControls.autoRotate = false
        threeControls.update()
    }

    useEffect(() => {
        if (fgRef.current !== undefined) {

            setGraphData(parsedData);


            const threeCamera = (fgRef.current.camera() as PerspectiveCamera)
            const threeControls = (fgRef.current.controls() as OrbitControls)
            threeControls.enablePan = false

            console.log("Starting PerspectiveCamera", threeCamera.fov, threeCamera.aspect, threeCamera.near, threeCamera.far)
            threeCamera.fov = 40
            threeCamera.near = 1
            threeCamera.far = 200
            threeCamera.updateProjectionMatrix()
            console.log("Changed PerspectiveCamera", threeCamera.fov, threeCamera.aspect, threeCamera.near, threeCamera.far)
            // threeControls.saveState()

            if (!isRotationActive) {
                // clearInterval(rotateTimer.current)
            } else {
                console.log("Initial useEffect camera pos ", fgRef.current?.camera().position)
                rotate()
            }

        }
    }, []);

    const handleClick = useCallback(
        (node: any) => {
            // clearInterval(rotateTimer.current)
            setIsRotationActive(false)
            // angle.current = 0
            handleDragEnd(node)
            const viewDistance = 60;
            const distRatio = 1 + viewDistance / Math.hypot(node.x, node.y, node.z);
            // fgRef.current.getGraphBbox()
            // const distMult = Math.sqrt((node.x - fgRef.current.camera().x)**2 + (node.y - fgRef.current.camera().y)**2 + (node.z - fgRef.current.camera().z)**2)

            fgRef.current?.cameraPosition(
                {x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio}, // new position
                {x: 0, y: 0, z: 0}, // node  // lookAt ({ x, y, z })
                3000  // ms transition duration
            )
        },
        [fgRef]
    );

    const handleDragEnd = (node: any) => {
        Graph.props.graphData.nodes.forEach((origNode: any) => {
            if (origNode.fx !== undefined) {
                console.log(`Node ${origNode.id}: x = ${origNode.x}, y = ${origNode.y}, z = ${origNode.z}, fx = ${origNode.fx}, fy = ${origNode.fy}, fz = ${origNode.fz}`);
                origNode.fx = undefined
                origNode.fy = undefined
                origNode.fz = undefined
            }
        })

        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
    }

    const handleRightClick = (node: any) => {
        console.log(`Node ${node.id}: x = ${node.x}, y = ${node.y}, z = ${node.z}, fx = ${node.fx}, fy = ${node.fy}, fz = ${node.fz}`);
    }


    const handleRotationClick = useCallback(
        () => {
            setIsRotationActive(!isRotationActive)
        }, [isRotationActive]
    )

    const handleResetClick = useCallback(
        () => {
            if (isRotationActive) {
                disableRotate()
            }
            fgRef.current?.zoomToFit()
            // const threeControls = (fgRef.current?.controls() as OrbitControls)
            // threeControls.reset()
            if (isRotationActive) {
                rotate()
            }
        }, [isRotationActive]
    )


    useEffect(() => {
        if (fgRef.current !== undefined) {
            // console.log(isRotationActive, angle.current)
            // const threeControls = fgRef.current.controls() as OrbitControls
            if (!isRotationActive) {
                // clearInterval(rotateTimer.current)
                // threeControls.enableZoom = true
                // threeControls.enableRotate = true
                disableRotate()
            } else {
                // threeControls.enableZoom = false
                // threeControls.enableRotate = false
                console.log("Rotate starting position", fgRef.current.camera().position)

                rotate()

                // // only do 3000 if camera has been moved - TODO
                // fgRef.current.zoomToFit(3000)

                // // fgRef.current.cameraPosition({
                // //     x: 0,
                // //     y: 0, // y: distance,
                // //     z: distance * Math.cos(angle.current)
                // // }, {x:0,y:0,z:0},3000);
                // setTimeout(() => {
                //     console.log("Button click camera pos ", fgRef.current?.camera().position)
                //     rotate()
                // }, 3500)
            }
        }
    }, [isRotationActive])


    const Graph = <ForceGraph3D
        ref={fgRef}
        controlType="orbit"
        backgroundColor="#000003"
        graphData={graphData}
        nodeRelSize={6}
        nodeLabel="id"
        enableNavigationControls={true}
        enableNodeDrag={true}
        showNavInfo={true}
        nodeAutoColorBy="group"
        nodeResolution={64}
        warmupTicks={50}
        // cooldownTicks={0}
        // cooldownTime={2000}
        onNodeClick={handleClick}
        onNodeDragEnd={handleDragEnd}
        onNodeRightClick={handleRightClick}
        // d3AlphaDecay={0}
        // d3VelocityDecay={0}
    />


    return <div>
        {Graph}
        <div className="absolute top-[5px] right-[5px]">
            <button id="resetToggle" className="m-[8px] h-[25px] w-[150px]" onClick={handleResetClick}>
                Reset Camera
            </button>
            <button id="rotationToggle" className="m-[8px] h-[25px] w-[150px]" onClick={handleRotationClick}>
                {(isRotationActive ? 'Pause' : 'Resume')} Rotation
            </button>
        </div>
    </div>
}

export default FocusGraph;

