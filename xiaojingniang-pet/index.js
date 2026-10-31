/**
 * Host half of the 小鲸娘 desktop-pet bundle.
 *
 * The pet artwork (transparent-background WebM animations plus PNG stills) is
 * shipped inside this package under `assets/`. The browser half cannot import
 * binary files from a plain-JS client bundle, so this half registers one HTTP
 * route on the Harness web carrier and streams those files from the package
 * directory. Serving from the package keeps the plugin self-contained: nothing
 * reads a path on the user's desktop at runtime.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** URL prefix owned by this plugin. The Client half builds media URLs on it. */
export const ASSET_ROUTE = '/dsh-pet-assets'

/** Absolute directory holding `anim/*.webm` and `png/*.png`. */
const ASSET_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'assets')

const MIME = {
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

/** Write one short, body-less response, clearing headers a file response set. */
function sendStatus(res, status) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')
  res.removeHeader('Content-Length')
  res.removeHeader('Content-Range')
  res.removeHeader('Accept-Ranges')
  res.end(status === 404 ? 'not found' : String(status))
}

/**
 * Parse one `Range` header against a known size.
 * @returns `null` when the header is not a byte range this handler can serve,
 *   `'unsatisfiable'` when the range lies outside the file, or the window.
 */
function parseRange(header, size) {
  if (typeof header !== 'string') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const startText = match[1]
  const endText = match[2]
  if (startText === '' && endText === '') return null
  let start = startText === '' ? Number.NaN : Number(startText)
  let end = endText === '' ? Number.NaN : Number(endText)
  if (Number.isNaN(start) && Number.isNaN(end)) return null
  if (Number.isNaN(start)) {
    // Suffix form: the last N bytes.
    start = Math.max(0, size - end)
    end = size - 1
  } else if (Number.isNaN(end) || end >= size) {
    end = size - 1
  }
  if (start > end || start >= size) return 'unsatisfiable'
  return { start, end }
}

/** Stream one file with status, cache, and range handling. */
function serveFile(req, res, target, info) {
  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream'
  const size = info.size
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  const range = parseRange(req.headers.range, size)
  if (range === 'unsatisfiable') {
    res.statusCode = 416
    res.setHeader('Content-Range', 'bytes */' + size)
    res.end()
    return
  }

  const start = range === null ? 0 : range.start
  const end = range === null ? size - 1 : range.end
  if (range !== null) {
    res.statusCode = 206
    res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size)
  } else {
    res.statusCode = 200
  }
  res.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1))
  if (req.method === 'HEAD' || size === 0) {
    res.end()
    return
  }
  const stream = createReadStream(target, { start, end })
  stream.on('error', () => {
    if (!res.headersSent) sendStatus(res, 404)
    else res.destroy()
  })
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}

/** Build the HTTP handler bound to one asset directory. */
function createAssetHandler(root) {
  return async function assetHandler(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD')
        sendStatus(res, 405)
        return
      }
      const raw = typeof req.url === 'string' ? req.url : ''
      const pathname = decodeURIComponent(raw.split('?')[0] || '')
      if (!pathname.startsWith(ASSET_ROUTE + '/')) {
        sendStatus(res, 404)
        return
      }
      const relative = pathname.slice(ASSET_ROUTE.length + 1)
      if (relative.length === 0 || relative.indexOf('\0') >= 0) {
        sendStatus(res, 404)
        return
      }
      const target = normalize(join(root, relative))
      if (target !== root && !target.startsWith(root + sep)) {
        sendStatus(res, 403)
        return
      }
      const info = await stat(target)
      if (!info.isFile()) {
        sendStatus(res, 404)
        return
      }
      serveFile(req, res, target, info)
    } catch (error) {
      if (!res.headersSent) sendStatus(res, 404)
      else res.destroy()
    }
  }
}

/**
 * Activate the asset route.
 *
 * Registered through `ctx.inject` so the route follows the web-server lifetime:
 * it is re-registered after a service replacement and removed with the plugin.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () =>
        scope.webServer.register({
          kind: 'prefix',
          path: ASSET_ROUTE,
          handler: createAssetHandler(ASSET_ROOT),
        }),
      'desktop-pet-xiaojingniang: asset route',
    )
  })
}
