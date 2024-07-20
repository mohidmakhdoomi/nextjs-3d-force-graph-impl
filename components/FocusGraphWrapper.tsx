import dynamic from "next/dynamic";

const FocusGraph = dynamic(() => import("@/components/FocusGraph"), {
    ssr: false
});

export default FocusGraph;
