import { NextResponse } from "next/server";
import { hasRequiredServerEnv } from "@/lib/server-env";

export const runtime = "nodejs";

export async function GET() {
  const ok = hasRequiredServerEnv();

  return NextResponse.json(
    { ok },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
