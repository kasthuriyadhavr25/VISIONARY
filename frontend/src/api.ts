/** Central API URL helper. In development, Vite proxies /api to the backend. */
const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
export const apiUrl = (path: string) => `${configuredBase}${path.startsWith('/') ? path : `/${path}`}`
