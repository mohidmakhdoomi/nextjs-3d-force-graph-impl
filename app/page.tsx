import {SpeedInsights} from '@vercel/speed-insights/react';
import {Analytics} from "@vercel/analytics/react";
import FocusGraph from "./components/FocusGraphWrapper";
import dataFile from "@/app/graph/data";


export default async function Index() {

    const fgData = JSON.stringify(dataFile)

    return (
        <div>
            <FocusGraph data={fgData}/>
            <SpeedInsights/>
            <Analytics/>
        </div>
    );
}
