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
  const dataURL = ((process.env.NEXT_PUBLIC_VERCEL_ENV == 'local') ? "http://" : "https://") + process.env.NEXT_PUBLIC_VERCEL_URL + "/graph/"
  const start = new Date()
  const initialReq = await fetch(dataURL, { 
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
    }, 
    next: { revalidate: false } }
  )
  const initialFetch = JSON.stringify(await initialReq.json())
  
  // const initialFetch = await GetData()
  const end = new Date()
  console.log(dataURL + " graph data loaded in "+(end-start)+" ms.")
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
