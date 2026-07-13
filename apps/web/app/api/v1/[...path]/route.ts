import { proxyLocalDemoApi } from "../../../../src/api/local-api-proxy.ts";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ path: string[] }> }>;

async function handle(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyLocalDemoApi(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
