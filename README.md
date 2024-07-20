nextjs-3d-force-graph-impl
==========================

An implementation of 3d [react-force-graph](https://github.com/vasturiano/react-force-graph) in a [Next.js](https://github.com/vercel/next.js) App Router application and also uses some components directly from [Three.js](https://github.com/mrdoob/three.js).

Serves as an example of combining various features of react-force-graph-3d + manipulating Three.js Camera, Controls and Scene + handling Next.js dynamic loading  

Additionally, uses [TypeScript](https://github.com/microsoft/TypeScript) with some simple [tailwindcss](https://github.com/tailwindlabs/tailwindcss), includes buttons that dynamically interact with the graph and makes use of useCallback, useEffect, useRef and useState [React](https://github.com/facebook/react) components.

Data used for the graph is a subset of the Neo4j StackOverflow Dataset.

## Functionality

| Action                                     | Description                                                                                                                             |
|--------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Mouse left click on Node                   | Focus on Node and point camera at graph origin (0,0,0), <br>auto stop graph rotation, fix this Nodes position but unfix all other Nodes |
| Mouse right click on Node                  | Unfix this Nodes position                                                                                                               |
| Mouse left/middle/right click Drag on Node | On release of mouse button fix this Nodes position but unfix all other Nodes                                                            |
| Mouse scroll wheel                         | Zoom in and out of graph                                                                                                                |
| Mouse left click Drag on background        | Rotate graph around the origin (0,0,0)                                                                                                  |
| **Show / Hide Axes**                       | Show/Hide X, Y, Z axes helpers                                                                                                          |
| **Reset Camera**                           | Pause auto rotation if active, Zoom out to fit all nodes in view, Resume auto rotation if paused                                        |
| **Pause / Resume Auto Rotation**           | Pause/Resume automatic horizontal rotation of graph around origin (0,0,0)                                                               |             


#### NOTE:
In the first 8 seconds mouse interaction is disabled after which it is enabled. <br>This applies only to non button interaction listed in above table (buttons are bolded).   