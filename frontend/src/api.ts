/** Central API URL helper. In development, Vite proxies /api to localhost:8787.
 * In production, fail loudly if the backend URL wasn't configured: otherwise the
 * browser silently calls the Vercel frontend domain and gets a misleading 404.
 */
const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim()
const configuredBase = rawBase.replace(/\/+$/, '')

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (import.meta.env.PROD && !configuredBase) {
    throw new Error(
      'Backend URL is not configured. Set VITE_API_BASE_URL in Vercel to your deployed Render backend URL, then redeploy the frontend.'
    )
  }
  return `${configuredBase}${normalizedPath}`
}
