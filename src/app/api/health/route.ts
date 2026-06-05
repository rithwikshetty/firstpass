import { NextRequest, NextResponse } from "next/server";
import { missingServerEnv } from "@/lib/server-env";
import { logger } from "@/lib/logger";
import { withRequestLogging } from "@/lib/route-logging";

export const runtime = "nodejs";

export async function GET(request?: NextRequest) {
  return withRequestLogging(request, "api.health", async (logContext) => {
    const missing = missingServerEnv();
    const ok = missing.length === 0;

    if (ok) {
      logger.info("health.ok", logContext);
    } else {
      logger.error("health.misconfigured", { ...logContext, missingEnv: missing });
    }

    return NextResponse.json(
      { ok },
      {
        status: ok ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
