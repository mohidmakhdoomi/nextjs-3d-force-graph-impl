import dynamic from "next/dynamic";

const FocusGraph = dynamic(() => import("@/app/components/FocusGraph"), {
    ssr: false
});

export default FocusGraph;
