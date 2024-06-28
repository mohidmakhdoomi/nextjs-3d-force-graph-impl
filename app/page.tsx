import DeployButton from "../components/DeployButton";
import AuthButton from "../components/AuthButton";
import { createClient } from "@/utils/supabase/server";
import ConnectSupabaseSteps from "@/components/tutorial/ConnectSupabaseSteps";
import SignUpUserSteps from "@/components/tutorial/SignUpUserSteps";
import Header from "@/components/Header";
import { SpeedInsights } from '@vercel/speed-insights/react';
import FocusGraph from "./FocusGraph";

// import { GetData } from "./DataGetter"

export default async function Index() {
  const isSupabaseConnected = true //canInitSupabaseClient();
  // console.log('ok')
  const dataURL = ((process.env.NEXT_PUBLIC_VERCEL_ENV == 'local') ? "http://" : "https://") + process.env.NEXT_PUBLIC_VERCEL_URL + "/graph"
  console.log("!!! CI: ", process.env.CI)
  const start = new Date()
  let initialFetch
  try {
      const initialReq = await fetch(dataURL, {         
        next: { revalidate: 0 } 
      }
    )
    initialFetch = JSON.stringify(await initialReq.json())
  } catch(err) {
    let errorMessage
    if (err instanceof Error) {
      errorMessage = err.cause;
    }

    if (process.env.CI === "true") {
      console.log(`-- Build in progress cannot access /graph endpoint --\n-- URL --\n${dataURL}`)
    } else {
      console.log(`-- JSON Fetching error --\n-- URL --\n${dataURL}`)
      console.log(`-- JSON Fetching error --\n${err}\n-- Cause --\n${errorMessage}`)
    }
    initialFetch = JSON.stringify({nodes: [], links: []})
  }
  // const initialFetch = await GetData()
  const end = new Date()
  console.log(dataURL + " graph data loaded in "+(end.valueOf()-start.valueOf())+" ms.")
  // console.log("page", JSON.parse(initialFetch)['links'][5])
    
  return (
    <div className="flex-1 w-full flex flex-col gap-20 items-center">
      <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
        <div className="w-full max-w-4xl flex justify-between items-center p-3 text-sm">
          <DeployButton />
          {isSupabaseConnected && <AuthButton />}
        </div>
      </nav>

      <div className="flex-1 flex flex-col gap-20 max-w-4xl px-3">
        <Header />
        <main className="flex-1 flex flex-col gap-6">
          <FocusGraph data={initialFetch} />
          <h2 className="font-bold text-4xl mb-4">Next steps</h2>
          {isSupabaseConnected ? <SignUpUserSteps /> : <ConnectSupabaseSteps />}
        </main>
      </div>

      <footer className="w-full border-t border-t-foreground/10 p-8 flex justify-center text-center text-xs">
        <p>
          Powered by{" "}
          <a
            href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
            target="_blank"
            className="font-bold hover:underline"
            rel="noreferrer"
          >
            Supabase
          </a>
        </p>
      </footer>
      <SpeedInsights />
    </div>
  );
}
