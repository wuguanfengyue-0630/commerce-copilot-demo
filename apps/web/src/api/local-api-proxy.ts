const localApiOrigin = "http://127.0.0.1:4000";
const responseHeaders = ["content-type", "cache-control", "etag", "last-modified", "x-request-id"];

export async function proxyLocalDemoApi(
  request: Request,
  segments: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const sourceUrl = new URL(request.url);
  const safePath = segments.map((segment) => encodeURIComponent(segment)).join("/");
  const target = `${localApiOrigin}/api/v1/${safePath}${sourceUrl.search}`;
  const headers = new Headers({ accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType !== null) headers.set("content-type", contentType);
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  const upstream = await fetcher(target, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body }),
    signal: request.signal,
  });
  const returnedHeaders = new Headers();
  for (const name of responseHeaders) {
    const value = upstream.headers.get(name);
    if (value !== null) returnedHeaders.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: returnedHeaders,
  });
}
