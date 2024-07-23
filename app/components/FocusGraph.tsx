'use client'

import {useCallback, useEffect, useRef, useState} from "react";
import ForceGraph3D, {ForceGraphMethods} from "react-force-graph-3d";
import {PerspectiveCamera, Scene, Vector3, AxesHelper} from "three";
import {TrackballControls} from 'three/examples/jsm/controls/TrackballControls.js';

function FocusGraph({data, enableDelay=4000}: { data: string, enableDelay?: number }) {
    const fgRef = useRef<ForceGraphMethods>();
    const counter = useRef<number>(0);
    const mainEffectCounter = 1

    // eslint-disable-next-line prefer-const
    let Graph: any;

    let parsedData: { nodes: never[], links: never[] }
    try {
        parsedData = JSON.parse(data)
    } catch (err) {
        let errorMessage
        if (err instanceof Error) {
            errorMessage = err.cause;
        }
        console.error(`-- JSON Parsing error --\n${err}\n-- Cause --\n${errorMessage}`)
        parsedData = {nodes: [], links: []}
    }

    const [graphData, setGraphData] = useState({nodes: [], links: []});

    const rotateTimer = useRef<NodeJS.Timeout>();

    const [clickEnabled, setClickEnabled] = useState<boolean>(false);

    const defaultAxesVisible = false;
    const [areAxesVisible, setAreAxesVisible] = useState<boolean>(defaultAxesVisible.valueOf());

    const defaultStartRotation = true;
    const [isRotationActive, setIsRotationActive] = useState<boolean>(defaultStartRotation.valueOf());

    function rotate() {
        if (rotateTimer.current === undefined) {
            const threeControls = (fgRef.current?.controls() as TrackballControls)
            const threeCamera = fgRef.current?.camera() as PerspectiveCamera
            console.debug("--------------------------------")
            console.debug("camera pos ", threeCamera.position)
            console.debug("camera up ", threeCamera.up)
            const worldDir = new Vector3();
            threeCamera.getWorldDirection(worldDir)
            console.debug("world dir ", worldDir)
            console.debug("control target  ", threeControls.target)
            console.debug("--------------------------------")


            rotateTimer.current = setInterval(() => {
                if (fgRef.current !== undefined) {
                    const threeCam = fgRef.current.camera() as PerspectiveCamera
                    const upVec = threeCam.up.clone()
                    threeCam.position.applyAxisAngle(upVec, -Math.PI / 300);

                    threeCam.rotateOnAxis(upVec, -Math.PI / 300); // rotate the OBJECT
                }
            }, 20);
        } else {
            console.debug("ROTATE rotation already on")
        }
    }

    function disableRotate() {
        clearInterval(rotateTimer.current)
        rotateTimer.current = undefined
    }

    function showAxes() {
        if (fgRef.current !== undefined) {
            const threeScene = (fgRef.current.scene() as Scene)
            const axesHelper = threeScene.getObjectByName("myAxesHelper")!
            axesHelper.visible = true;
        }
    }

    function hideAxes() {
        if (fgRef.current !== undefined) {
            const threeScene = (fgRef.current.scene() as Scene)
            const axesHelper = threeScene.getObjectByName("myAxesHelper")!
            axesHelper.visible = false;
        }
    }

    useEffect(() => {
        if (fgRef.current !== undefined) {
            counter.current += 1;
            console.debug("!!! updated counter:", counter.current)
            if (counter.current == mainEffectCounter) {
                console.info("MAIN USE EFFECT!")
                setGraphData(parsedData);

                const threeCamera = (fgRef.current.camera() as PerspectiveCamera)
                const threeControls = (fgRef.current.controls() as TrackballControls)
                threeControls.noPan = true
                threeControls.zoomSpeed = 1.0

                console.debug("Starting PerspectiveCamera", threeCamera.fov, threeCamera.aspect, threeCamera.near, threeCamera.far)
                threeCamera.fov = 40
                threeCamera.near = 1
                threeCamera.far = 200
                threeCamera.updateProjectionMatrix()
                console.info("Changed PerspectiveCamera", threeCamera.fov, threeCamera.aspect, threeCamera.near, threeCamera.far)

                const threeScene = (fgRef.current.scene() as Scene)
                const axesHelper = new AxesHelper(5000);
                axesHelper.name = "myAxesHelper";
                axesHelper.visible = defaultAxesVisible;
                threeScene.add(axesHelper);

                fgRef.current.refresh();

                console.debug("!!! STARTING timers")
                if (defaultStartRotation) {
                    setTimeout(() => {
                        setIsRotationActive(true);
                        console.info("SET isRotationActive to true!");
                    }, 200)
                }
                setTimeout(() => {
                    setClickEnabled(true);
                    console.info("SET clickEnabled to true!");
                    fgRef.current?.refresh();
                }, enableDelay)
            }
            if (counter.current >= mainEffectCounter) {
                (fgRef.current.controls() as TrackballControls).update();
                console.debug("!!! updated controls !!!");
            }
        }
    }, [defaultAxesVisible, defaultStartRotation, parsedData, enableDelay]);


    function printNode(node: any) {
        return `Node ${node.id}: x = ${node.x}, y = ${node.y}, z = ${node.z}, fx = ${node.fx}, fy = ${node.fy}, fz = ${node.fz}`;
    }

    const handleDragEnd = useCallback(
        (node: any) => {
            if (clickEnabled) {
                Graph?.props.graphData.nodes.forEach((origNode: any) => {
                    if (origNode.fx !== undefined && origNode.x !== node.x && origNode.y !== node.y && origNode.z !== node.z) {
                        console.debug("UNFIXED previously dragged node - before", printNode(origNode));
                        origNode.fx = undefined
                        origNode.fy = undefined
                        origNode.fz = undefined
                        console.debug("UNFIXED previously dragged node - after", printNode(origNode));
                    }
                })
                console.debug("NODE DRAG END - current", printNode(node))
                node.fx = node.x;
                node.fy = node.y;
                node.fz = node.z;
                console.debug("NODE DRAG END - set fx, fy, fz to x, y, z", printNode(node))
            }
        },
        [Graph?.props.graphData.nodes, clickEnabled]
    );


    const handleClick = useCallback(
        (node: any) => {
            if (clickEnabled) {
                if (isRotationActive) {
                    setIsRotationActive(false)
                }

                handleDragEnd(node)
                console.debug("LEFT CLICK - current", printNode(node))
                const viewDistance = 80;
                const distRatio = 1 + viewDistance / Math.hypot(node.x, node.y, node.z);

                if (fgRef.current !== undefined) {
                    fgRef.current.cameraPosition(
                        {x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio},
                        {x: 0, y: 0, z: 0},
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
                console.debug("RIGHT CLICK - current", printNode(node))
                node.fx = undefined
                node.fy = undefined
                node.fz = undefined
                console.debug("RIGHT CLICK - set fx, fy, fz to undefined", printNode(node))
            }
        },
        [clickEnabled]
    );

    const handleAxesClick = useCallback(
        () => {
            setAreAxesVisible(!areAxesVisible)
        }, [areAxesVisible]
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
                    console.debug("RESET camera turn OFF rotation ")
                    disableRotate()
                }
                fgRef.current.zoomToFit(1000)
                setTimeout(() => {
                    if (isRotationActive) {
                        console.debug("RESET camera turn ON rotation ")
                        rotate()
                    }
                }, 1001)
            }
        }, [isRotationActive]
    )


    useEffect(() => {
        if (fgRef.current !== undefined && counter.current >= mainEffectCounter) {
            if (!isRotationActive) {
                console.debug("USE EFFECT turn OFF rotation ")
                disableRotate()
            } else {
                console.debug("USE EFFECT turn ON rotation ")
                rotate()
            }
        }
    }, [isRotationActive])


    useEffect(() => {
        if (fgRef.current !== undefined && counter.current >= mainEffectCounter) {
            if (!areAxesVisible) {
                console.debug("USE EFFECT axes HIDE")
                hideAxes()
            } else {
                console.debug("USE EFFECT axes SHOW")
                showAxes()
            }
        }
    }, [areAxesVisible])

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
        onNodeClick={handleClick}
        onNodeDragEnd={handleDragEnd}
        onNodeRightClick={handleRightClick}
    />


    return <div className="bg-background text-foreground">
        {Graph}
        <div className="absolute top-[5px] right-[5px]">
            <button id="axesToggle" className="m-[8px] h-[25px] w-[150px]" onClick={handleAxesClick}>
                {(areAxesVisible ? 'Hide' : 'Show')} Axes
            </button>
            <button id="resetToggle" className="m-[8px] h-[25px] w-[150px]" onClick={handleResetClick}>
                Reset Camera
            </button>
            <button id="rotationToggle" className="m-[8px] h-[25px] w-[200px]" onClick={handleRotationClick}>
                {(isRotationActive ? 'Pause' : 'Resume')} Auto Rotation
            </button>
        </div>
    </div>
}

export default FocusGraph;
