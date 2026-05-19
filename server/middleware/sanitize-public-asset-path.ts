export default defineEventHandler((event) => {
  if (!event.path.includes('"') && !/%22/i.test(event.path)) {
    return
  }

  if (!event.path.includes('/_nuxt/')) {
    return
  }

  event.path = event.path.replace(/%22/gi, '').replace(/"/g, '')

  if (event.node.req.url) {
    event.node.req.url = event.node.req.url.replace(/%22/gi, '').replace(/"/g, '')
  }

  if (event.node.req.originalUrl) {
    event.node.req.originalUrl = event.node.req.originalUrl.replace(/%22/gi, '').replace(/"/g, '')
  }
})
