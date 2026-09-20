import { NextResponse } from "next/server";
import { pushControlCenterMetrics } from "@/lib/control-center-metrics";

export async function POST(req: Request) {
  const expected=process.env.METRICS_PUSH_SECRET?.trim();
  if(!expected || req.headers.get("authorization")!==`Bearer ${expected}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const {payload,result}=await pushControlCenterMetrics();
    return NextResponse.json({ok:true,metrics:payload,controlCenter:result});
  } catch(error) {
    console.error("sejoura metrics push:",error);
    return NextResponse.json({error:"Metrics collection failed"},{status:500});
  }
}
