'use client'

import dynamic from "next/dynamic";

const FocusGraph = dynamic(() => import("./FocusGraph"), {
    ssr: false
});

export default FocusGraph;
