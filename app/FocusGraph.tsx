'use client'

import {useCallback, useEffect, useRef, useState} from "react";
import ForceGraph3D, {ForceGraphMethods} from "react-force-graph-3d";
// import {ForceGraph3DGenericInstance, ForceGraph3DInstance} from "3d-force-graph";
// import { Vector3 } from '@react-three/fiber';
// import * as THREE from 'three';
import {PerspectiveCamera, Scene, Vector3, AxesHelper} from "three";
// import {Group, Plane, PlaneHelper, Quaternion} from "three";
import {TrackballControls} from "three-stdlib";
// import {forceLink} from "d3-force-3d/src";
// import dynamic from "next/dynamic";
// import origData from "./data";
// import { GetData } from "./DataGetter"
// import useSWR from 'swr'

// const fetcher = (...args) => fetch(...args).then((res) => JSON.parse(res))

// const d3 = require('d3-force-3d')

function FocusGraph({data,}: { data: string }) {
    const fgRef = useRef<ForceGraphMethods>();
    const counter = useRef<number>(0);
    const mainEffectCounter = 1
    const [clickEnabled, setClickEnabled] = useState<boolean>(false);

    // eslint-disable-next-line prefer-const
    let Graph : any;// = useRef<ReactElement>();

    let parsedData: {nodes: never[], links: never[]}
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

    const rotateTimer = useRef<NodeJS.Timeout>();
    // const angle = useRef<number>(0);
    const defaultAxisVisible = false;
    const [isAxisVisible, setIsAxisVisible] = useState<boolean>(defaultAxisVisible.valueOf());

    const defaultStartRotation = true;
    const [isRotationActive, setIsRotationActive] = useState<boolean>(defaultStartRotation.valueOf());

    // const cameraX = useRef<number>(0);
    // const cameraY = useRef<number>(0);
    // const cameraZ = useRef<number>(7500);

    // const nodes = parsedData.nodes.map((node) => ({
    //     id: node.id,
    //     group: node.group,
    //     // x: Math.random(),
    //     // y: Math.random(),
    //     // z: Math.random(),
    //     // vx: (Math.random() * 2) - 1,
    //     // vy: (Math.random() * 2) - 1,
    //     // vz: (Math.random() * 2) - 1,
    // }));
    //
    // parsedData = {nodes: nodes, links: parsedData.links};

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


        // const threeControls = fgRef.current?.controls() as OrbitControls;
        // threeControls.autoRotate = true
        // threeControls.update()


        // disableRotate()
        // const distance = 2000
        // angle.current = 0
        // rotateTimer.current = setInterval(() => {
        //     fgRef.current?.cameraPosition({
        //         x: distance * Math.sin(angle.current),
        //         z: distance * Math.cos(angle.current)
        //     });
        //     angle.current += Math.PI / 300;
        // }, 10);

        // disableRotate()
        if (rotateTimer.current === undefined) {
            const threeControls = (fgRef.current?.controls() as TrackballControls)
            const threeCamera = fgRef.current?.camera() as PerspectiveCamera
            console.log("--------------------------------")
            console.log("camera pos ", threeCamera.position)
            console.log("camera up ", threeCamera.up)
            const worldDir = new Vector3();
            threeCamera.getWorldDirection(worldDir)
            console.log("world dir ", worldDir)
            console.log("control target  ", threeControls.target)
            console.log("--------------------------------")

            // const origin = new Vector3(0,0,0);
            // const threeCamera = (fgRef.current?.camera() as PerspectiveCamera)
            // fgRef.current?.cameraPosition(threeCamera.position, origin, 10)

            // const origin = new Vector3(0,0,0);
            // const threeCamera = (fgRef.current?.camera() as PerspectiveCamera)

            rotateTimer.current = setInterval(() => {
                if (fgRef.current !== undefined) {
                    const threeCam = fgRef.current.camera() as PerspectiveCamera
                    // threeCamera.parent?.localToWorld(threeCamera.position); // compensate for world coordinate

                    // threeCamera.position.sub(origin); // remove the offset
                    const upVec = threeCam.up.clone()
                    threeCam.position.applyAxisAngle(upVec, -Math.PI / 300); // rotate the POSITION
                    // threeCamera.position.add(origin); // re-add the offset

                    // threeCamera.parent?.worldToLocal(threeCamera.position); // undo world coordinates compensation

                    threeCam.rotateOnAxis(upVec, -Math.PI / 300); // rotate the OBJECT
                }
            }, 20);

            // const upVec = threeCamera.up.clone()
            // threeCamera.position.applyAxisAngle(upVec, -Math.PI / 600); // rotate the POSITION
            // threeCamera.rotateOnAxis(upVec, -Math.PI / 600); // rotate the OBJECT




            // console.log(threeScene.)
            // rotateTimer.current = setInterval(() => {
            //     fgRef.current?.cameraPosition({
            //         x: cameraX.current * Math.sin(angle.current),
            //         y: cameraY.current, // * Math.cos(angle.current),
            //         z: cameraZ.current * Math.cos(angle.current)
            //     }, {x:0,y:0,z:0});
            //     angle.current += (Math.PI / 300)
            // }, 10);
        } else {
            console.log("ROTATE rotation already on")
        }

    }

    function disableRotate() {
        // const threeControls = fgRef.current?.controls() as OrbitControls;
        // threeControls.autoRotate = false
        // threeControls.update()


        clearInterval(rotateTimer.current)
        rotateTimer.current = undefined
        // console.log("DISABLED rotate")
        // const threeCamera = (fgRef.current?.camera() as PerspectiveCamera)
        // threeCamera.position.applyAxisAngle(threeCamera.up.clone(), 0);
        // threeCamera.rotateOnAxis(threeCamera.up.clone(), 0);
    }

    function showAxis() {
        if (fgRef.current !== undefined) {
            const threeScene = (fgRef.current.scene() as Scene)
            const axesHelper = threeScene.getObjectByName("myAxesHelper")!
            axesHelper.visible = true;
        }
    }

    function hideAxis() {
        if (fgRef.current !== undefined) {
            const threeScene = (fgRef.current.scene() as Scene)
            const axesHelper = threeScene.getObjectByName("myAxesHelper")!
            axesHelper.visible = false;
        }
    }

    useEffect(() => {
        if (fgRef.current !== undefined) {
            counter.current += 1;
            console.log("!!! updated counter:", counter.current)
            if (counter.current == mainEffectCounter) {
                console.log("MAIN USE EFFECT!")
                setGraphData(parsedData);
                fgRef.current.refresh();

                const threeCamera = (fgRef.current.camera() as PerspectiveCamera)
                const threeControls = (fgRef.current.controls() as TrackballControls)
                threeControls.noPan = true
                threeControls.zoomSpeed = 1.0

                console.log("Starting PerspectiveCamera", threeCamera.fov, threeCamera.aspect, threeCamera.near, threeCamera.far)
                threeCamera.fov = 40
                threeCamera.near = 1
                threeCamera.far = 200
                threeCamera.updateProjectionMatrix()
                console.log("Changed PerspectiveCamera", threeCamera.fov, threeCamera.aspect, threeCamera.near, threeCamera.far)
                // threeControls.saveState()

                const threeScene = (fgRef.current.scene() as Scene)
                const axesHelper = new AxesHelper( 5000 );
                axesHelper.name = "myAxesHelper";
                axesHelper.visible = defaultAxisVisible;
                threeScene.add( axesHelper );

                // setInterval(() => {
                //     (fgRef.current?.controls() as TrackballControls).update();
                // }, 5)

                // console.log("Graph.current.props.enableNodeDrag", Graph.current.props.enableNodeDrag)
                // console.log("Graph.current.props.enableNavigationControls", Graph.current.props.enableNavigationControls)
                // const newGraphProps = {...Graph.current.props, enableNodeDrag:false, enableNavigationControls:false}
                // const newGraph = {...Graph.current, props:newGraphProps}
                // Graph.current = newGraph
                // console.log("Graph.current.props.enableNodeDrag", Graph.current.props.enableNodeDrag)
                // console.log("Graph.current.props.enableNavigationControls", Graph.current.props.enableNavigationControls)
                // threeControls.enabled = false
                console.log("!!! STARTING timers")
                if (defaultStartRotation) {
                    setTimeout(() => {
                        setIsRotationActive(true);
                        console.log("SET isRotationActive to true!");
                    }, 200)
                }
                setTimeout(() => {
                    // threeControls.enabled = true
                    // Graph.current?.props.enableNodeDrag = true
                    // Graph.current?.props.enableNavigationControls = true
                    setClickEnabled(true);
                    console.log("SET clickEnabled to true!");
                    fgRef.current?.refresh();
                }, 8000)
            }
            if (counter.current >= mainEffectCounter) {
                (fgRef.current.controls() as TrackballControls).update();
                console.log("!!! updated controls !!!");
            }
        }
    }, [defaultAxisVisible, defaultStartRotation, parsedData]);


    function printNode(node: any) {
        return `Node ${node.id}: x = ${node.x}, y = ${node.y}, z = ${node.z}, fx = ${node.fx}, fy = ${node.fy}, fz = ${node.fz}`;
    }

    const handleDragEnd = useCallback(
        (node: any) => {
            if (clickEnabled) {
                Graph?.props.graphData.nodes.forEach((origNode: any) => {
                    if (origNode.fx !== undefined && origNode.x !== node.x && origNode.y !== node.y && origNode.z !== node.z) {
                        console.log("UNFIXED previously dragged node - before", printNode(origNode));
                        origNode.fx = undefined
                        origNode.fy = undefined
                        origNode.fz = undefined
                        console.log("UNFIXED previously dragged node - after", printNode(origNode));
                    }
                })
                console.log("NODE DRAG END - current", printNode(node))
                node.fx = node.x;
                node.fy = node.y;
                node.fz = node.z;
                console.log("NODE DRAG END - set fx, fy, fz to x, y, z", printNode(node))
            }
        },
        [Graph?.props.graphData.nodes, clickEnabled]
    );


    const handleClick = useCallback(
        (node: any) => {
            if (clickEnabled) {
                // clearInterval(rotateTimer.current)
                if (isRotationActive) {
                    // disableRotate()
                    setIsRotationActive(false)

                }
                // angle.current = 0
                handleDragEnd(node)
                console.log("LEFT CLICK - current", printNode(node))
                const viewDistance = 80;
                const distRatio = 1 + viewDistance / Math.hypot(node.x, node.y, node.z);
                // fgRef.current.getGraphBbox()
                // const distMulti = Math.sqrt((node.x - fgRef.current.camera().x)**2 + (node.y - fgRef.current.camera().y)**2 + (node.z - fgRef.current.camera().z)**2)
                // fgRef.current?.zoomToFit(10, 0, (x) => (x.id === node.id));
                if (fgRef.current !== undefined) {
                    fgRef.current.cameraPosition(
                        {x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio}, // new position
                        {x: 0, y: 0, z: 0}, // node  // lookAt ({ x, y, z })
                        2000  // ms transition duration
                    )
                }
            }
        },
        [isRotationActive, handleDragEnd, clickEnabled]
    );

    const handleRightClick = useCallback(
        (node: any) => {
            if (clickEnabled && node.fx !== undefined) {
                console.log("RIGHT CLICK - current", printNode(node))
                node.fx = undefined
                node.fy = undefined
                node.fz = undefined
                console.log("RIGHT CLICK - set fx, fy, fz to undefined", printNode(node))
            }
        },
        [clickEnabled]
    );

    const handleAxisClick = useCallback(
        () => {
            setIsAxisVisible(!isAxisVisible)
        }, [isAxisVisible]
    )


    const handleRotationClick = useCallback(
        () => {
            setIsRotationActive(!isRotationActive)
        }, [isRotationActive]
    )

    const handleResetClick = useCallback(
        () => {
            if (fgRef.current !== undefined) {
                if (isRotationActive) {
                    console.log("RESET camera turn OFF rotation ")
                    disableRotate()
                }
                fgRef.current.zoomToFit(1000)
                // const threeControls = (fgRef.current?.controls() as OrbitControls)
                // threeControls.reset()
                setTimeout(() => {
                    if (isRotationActive) {
                        console.log("RESET camera turn ON rotation ")
                        rotate()
                    }
                }, 1001)
            }

            // const threeControls = (fgRef.current?.controls() as OrbitControls)
            // const threeCamera = fgRef.current?.camera() as PerspectiveCamera
            // console.log("pos ", threeCamera.position)
            // console.log("up ", threeCamera.up)
            // let worldDir = new Vector3();
            // threeCamera.getWorldDirection(worldDir)
            // console.log("world dir ", worldDir)
            // console.log("control pos 0  ", threeControls.position0)
            // console.log("control target 0  ", threeControls.target0)
            // console.log("control target  ", threeControls.target)

            // let q = new Quaternion();
            // threeControls.object.getWorldQuaternion(q);
            // let upVec
            // if (true) {
            //     upVec = new Vector3(0, 1, 0);
            // } else {  // threeCamera.ori === Orientation.Y
            //     upVec = new Vector3(0,0,1);
            // }
            // upVec.applyQuaternion(q);
            // threeCamera.up = threeCamera.position.clone();

            // threeControls.update();
        }, [isRotationActive]
    )


    useEffect(() => {
        if (fgRef.current !== undefined && counter.current >= mainEffectCounter) {
            // console.log(isRotationActive, angle.current)
            // const threeControls = fgRef.current.controls() as OrbitControls
            if (!isRotationActive) {
                // clearInterval(rotateTimer.current)
                // threeControls.enableZoom = true
                // threeControls.enableRotate = true
                console.log("USE EFFECT turn OFF rotation ")
                disableRotate()
            } else {
                // threeControls.enableZoom = false
                // threeControls.enableRotate = false
                // console.log("Rotate starting position", fgRef.current.camera().position)
                console.log("USE EFFECT turn ON rotation ")
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


    useEffect(() => {
        if (fgRef.current !== undefined && counter.current >= mainEffectCounter) {
            if (!isAxisVisible) {
                console.log("USE EFFECT axis HIDE")
                hideAxis()
            } else {
                console.log("USE EFFECT axis SHOW")
                showAxis()
            }
        }
    }, [isAxisVisible])

    Graph = <ForceGraph3D
        ref={fgRef}
        controlType="trackball"
        backgroundColor="#000003"
        graphData={graphData}
        nodeRelSize={6}
        nodeLabel="id"
        enableNavigationControls={clickEnabled}
        enableNodeDrag={clickEnabled}
        enablePointerInteraction={clickEnabled}
        showNavInfo={false}
        nodeAutoColorBy="group"
        nodeResolution={64}
        // warmupTicks={110}
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
            <button id="axisToggle" className="m-[8px] h-[25px] w-[150px]" onClick={handleAxisClick}>
                {(isAxisVisible ? 'Hide' : 'Show')} Axis
            </button>
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

