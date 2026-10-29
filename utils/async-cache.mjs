// Reuse SSR/client data only on navigation; refresh() must always reach the API.
export function initialCachedData(key, app, context) {
  if (context.cause !== 'initial') return undefined
  return app.payload.data[key] ?? app.static.data[key]
}
