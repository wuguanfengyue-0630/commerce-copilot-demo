export const developmentApiRewrite = {
  source: "/api/v1/:path*",
  destination: "http://127.0.0.1:4000/api/v1/:path*",
} as const;

export function apiRewritesFor(environment: string | undefined) {
  return environment === "development" ? [developmentApiRewrite] : [];
}
