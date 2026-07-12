export const legacyIndexRedirect = {
  source: "/index.html",
  destination: "/",
  permanent: false,
} as const;

export function legacyIndexRedirects() {
  return [legacyIndexRedirect];
}
