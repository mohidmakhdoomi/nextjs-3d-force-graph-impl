'use client'

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import ForceGraph3D, {
    ForceGraphMethods,
    GraphData,
    NodeObject,
} from "react-force-graph-3d";
import {AxesHelper, PerspectiveCamera} from "three";
import {TrackballControls} from 'three/examples/jsm/controls/TrackballControls.js';
import {createFocusGraphResources} from "./focusGraphResources";

function FocusGraph({data, enableDelay=4000}: { data: string, enableDelay?: number }) {
    const fgRef = useRef<ForceGraphMethods>(undefined);
    const resources = useMemo(() => createFocusGraphResources(), []);

    const graphData = useMemo<GraphData>(() => {
        try {
            return JSON.parse(data) as GraphData;
        } catch (error) {
            const cause = error instanceof Error ? error.cause : undefined;
            console.error(`-- JSON Parsing error --\n${error}\n-- Cause --\n${cause}`)
            return {nodes: [], links: []};
        }
    }, [data]);

    const [clickEnabled, setClickEnabled] = useState(false);
    const [areAxesVisible, setAreAxesVisible] = useState(false);
    const [isRotationActive, setIsRotationActive] = useState(true);

    const stopRotation = useCallback(() => {
        resources.stopRotation();
    }, [resources]);

    const startRotation = useCallback(() => {
        const graph = fgRef.current;
        if (graph === undefined) {
            return;
        }

        resources.startRotation(() => {
            const currentGraph = fgRef.current;
            if (currentGraph === undefined) {
                return;
            }

            const currentCamera = currentGraph.camera() as PerspectiveCamera;
            const up = currentCamera.up.clone();
            currentCamera.position.applyAxisAngle(up, -Math.PI / 300);
            currentCamera.rotateOnAxis(up, -Math.PI / 300);
        });
    }, [resources]);

    useEffect(() => {
        const graph = fgRef.current;
        if (graph === undefined) {
            return;
        }

        const camera = graph.camera() as PerspectiveCamera;
        const controls = graph.controls() as TrackballControls;
        controls.noPan = true;
        controls.zoomSpeed = 1.0;
        camera.fov = 40;
        camera.near = 1;
        camera.far = 200;
        camera.updateProjectionMatrix();

        const scene = graph.scene();
        const axesHelper = new AxesHelper(5000);
        axesHelper.name = "myAxesHelper";
        axesHelper.visible = false;
        resources.attachAxes(scene, axesHelper);

        controls.update();
        graph.refresh();
        setClickEnabled(false);

        resources.scheduleInteraction(() => {
            setClickEnabled(true);
            fgRef.current?.refresh();
        }, enableDelay);

        return resources.cleanup;
    }, [enableDelay, graphData, resources]);

    const handleDragEnd = useCallback(
        (node: NodeObject) => {
            if (clickEnabled) {
                graphData.nodes.forEach((origNode) => {
                    if (origNode.fx !== undefined && origNode.x !== node.x && origNode.y !== node.y && origNode.z !== node.z) {
                        origNode.fx = undefined
                        origNode.fy = undefined
                        origNode.fz = undefined
                    }
                })
                node.fx = node.x;
                node.fy = node.y;
                node.fz = node.z;
            }
        },
        [clickEnabled, graphData.nodes]
    );

    const handleClick = useCallback(
        (node: NodeObject) => {
            if (clickEnabled) {
                if (isRotationActive) {
                    setIsRotationActive(false)
                }

                handleDragEnd(node)
                if (node.x === undefined || node.y === undefined || node.z === undefined) {
                    return;
                }

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
        (node: NodeObject) => {
            if (clickEnabled && node.fx !== undefined) {
                node.fx = undefined
                node.fy = undefined
                node.fz = undefined
            }
        },
        [clickEnabled]
    );

    const handleAxesClick = useCallback(
        () => {
            setAreAxesVisible((visible) => !visible)
        }, []
    )

    const handleRotationClick = useCallback(
        () => {
            setIsRotationActive((active) => !active)
        }, []
    )

    const handleResetClick = useCallback(
        () => {
            const graph = fgRef.current;
            if (graph !== undefined) {
                if (isRotationActive) {
                    stopRotation()
                }
                graph.zoomToFit(1000)
                resources.scheduleReset(() => {
                    if (isRotationActive) {
                        startRotation()
                    }
                }, 1001)
            }
        }, [isRotationActive, resources, startRotation, stopRotation]
    )

    useEffect(() => {
        if (isRotationActive) {
            startRotation();
        } else {
            stopRotation();
        }

        return () => {
            stopRotation();
            resources.cancelReset();
        };
    }, [graphData, isRotationActive, resources, startRotation, stopRotation])

    useEffect(() => {
        resources.setAxesVisible(areAxesVisible);
    }, [areAxesVisible, graphData, resources])

    const Graph = <ForceGraph3D
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
