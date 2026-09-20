import { NextResponse } from "next/server";
import { pushControlCenterMetrics } from "@/lib/control-center-metrics";

export async function GET(req: Request) {
  const expected=process.env.CRON_SECRET?.trim();
  if(!expected || req.headers.get("authorization")!==`Bearer ${expected}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const {payload}=await pushControlCenterMetrics();
    return NextResponse.json({ok:true,metrics:payload});
  } catch(error) {
    console.error("sejoura metrics cron:",error);
    return NextResponse.json({error:"Metrics synchronization failed"},{status:500});
  }
}
