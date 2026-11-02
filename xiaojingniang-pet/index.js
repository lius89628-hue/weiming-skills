/**
 * Host half of the 小鲸娘 desktop-pet bundle.
 *
 * Two jobs:
 *
 * 1. Artwork. The pet artwork (transparent-background WebM animations plus PNG
 *    stills) is shipped inside this package under `assets/`. The browser half
 *    cannot import binary files from a plain-JS client bundle, so this half
 *    registers one HTTP route on the Harness web carrier and streams those files
 *    from the package directory. Serving from the package keeps the plugin
 *    self-contained: nothing reads a path on the user's desktop at runtime.
 *
 * 2. Local brain. The 3.0 pet chats with the user's local Ollama. The DSH desktop
 *    renderer runs on the custom `dsh-app://app` origin, which the Ollama CORS
 *    allowlist does not include, so a direct browser fetch is rejected at
 *    preflight (OPTIONS 403). This half therefore exposes a same-origin
 *    `POST /dsh-pet-brain/chat` route: the renderer calls it like any other
 *    DSH-hosted path, and this Host process — which has no browser CORS at all —
 *    forwards the request to `127.0.0.1:11434/api/chat` and streams the NDJSON
 *    answer back. The upstream host and port are hard-coded, the model and the
 *    generation controls are fixed here (`xjn-brain`, `think: false`,
 *    `options.num_gpu: 0`), and nothing else is ever contacted or read.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** URL prefix owned by this plugin for artwork. The Client half builds media URLs on it. */
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

/* ---------------------------------------------------------------------- */
/* Local-brain proxy: the only same-origin chat route                      */
/* ---------------------------------------------------------------------- */

/** Same-origin base the Client half calls; it never talks to Ollama directly. */
export const BRAIN_ROUTE = '/dsh-pet-brain'
const BRAIN_CHAT_PATH = BRAIN_ROUTE + '/chat'

/** The only upstream this Host half ever contacts: the user's local Ollama. */
const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434
/** Fixed model and generation controls: no thinking trace, CPU only. */
const OLLAMA_MODEL = 'xjn-brain'
const OLLAMA_THINK = false
const OLLAMA_OPTIONS = { num_gpu: 0 }
/** Request-body and upstream-timeout budgets. */
const MAX_BRAIN_BODY = 256 * 1024
const BRAIN_UPSTREAM_TIMEOUT_MS = 180000

/** Write one small JSON response. */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Length', String(Buffer.byteLength(body)))
  res.end(body)
}

/** Read a request body up to `limit` bytes. */
function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    function fail(error) {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', function (chunk) {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        fail(new Error('brain-body-too-large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', function () {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', fail)
  })
}

/**
 * Accept only the message list this plugin sends: a short Conversation with
 * known roles and bounded text. Everything else (model, options, stream) is
 * decided by this Host half, never by the caller.
 */
function sanitizeMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return null
  const messages = []
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index]
    if (!item || typeof item !== 'object') return null
    const role = item.role
    const content = item.content
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
    if (typeof content !== 'string') return null
    const text = content.trim()
    if (text.length === 0 || text.length > 4000) return null
    messages.push({ role: role, content: text })
  }
  return messages
}

/**
 * Build the `POST /dsh-pet-brain/chat` handler. The upstream defaults to the
 * user's local Ollama; tests may pass another local port to exercise the
 * offline path without touching the real service.
 */
export function createBrainHandler(upstream) {
  const target =
    upstream && typeof upstream === 'object'
      ? {
          host: typeof upstream.host === 'string' ? upstream.host : OLLAMA_HOST,
          port: typeof upstream.port === 'number' ? upstream.port : OLLAMA_PORT,
          model: typeof upstream.model === 'string' ? upstream.model : OLLAMA_MODEL,
        }
      : { host: OLLAMA_HOST, port: OLLAMA_PORT, model: OLLAMA_MODEL }

  return async function brainHandler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    let pathname = ''
    try {
      const raw = typeof req.url === 'string' ? req.url : ''
      pathname = decodeURIComponent(raw.split('?')[0] || '')
    } catch (error) {
      pathname = ''
    }
    if (pathname !== BRAIN_CHAT_PATH) {
      sendJson(res, 404, { error: 'not-found' })
      return
    }

    let messages
    try {
      const body = await readRequestBody(req, MAX_BRAIN_BODY)
      const parsed = JSON.parse(body)
      messages = sanitizeMessages(parsed && parsed.messages)
    } catch (error) {
      sendJson(res, 400, { error: 'bad-request' })
      return
    }
    if (messages === null) {
      sendJson(res, 400, { error: 'bad-messages' })
      return
    }

    const payload = JSON.stringify({
      model: target.model,
      messages: messages,
      stream: true,
      think: OLLAMA_THINK,
      options: OLLAMA_OPTIONS,
    })

    let settled = false
    const upstreamRequest = httpRequest({
      host: target.host,
      port: target.port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
    })
    const timeout = setTimeout(function () {
      if (settled) return
      settled = true
      if (!res.headersSent) sendJson(res, 504, { error: 'brain-timeout' })
      else res.destroy()
      if (!upstreamRequest.destroyed) upstreamRequest.destroy()
    }, BRAIN_UPSTREAM_TIMEOUT_MS)

    upstreamRequest.on('response', function (upstreamResponse) {
      if (settled) {
        upstreamResponse.resume()
        return
      }
      if (upstreamResponse.statusCode !== 200) {
        settled = true
        clearTimeout(timeout)
        upstreamResponse.resume()
        if (!res.headersSent) sendJson(res, 502, { error: 'brain-bad-response' })
        else res.destroy()
        return
      }
      settled = true
      clearTimeout(timeout)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Accel-Buffering', 'no')
      upstreamResponse.on('error', function () {
        if (!res.writableEnded) res.destroy()
      })
      upstreamResponse.pipe(res)
    })

    /* Ollama not running / refused: a soft 503 the pet renders as 「睡醒」 line. */
    upstreamRequest.on('error', function () {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (res.headersSent) res.destroy()
      else sendJson(res, 503, { error: 'brain-asleep' })
    })

    /* The renderer closed the request (hide/quit/cap): stop CPU generation. */
    res.on('close', function () {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
      }
      if (!upstreamRequest.destroyed) upstreamRequest.destroy()
    })

    upstreamRequest.write(payload)
    upstreamRequest.end()
  }
}

/* ---------------------------------------------------------------------- */
/* Artwork route                                                          */
/* ---------------------------------------------------------------------- */

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
 * Activate both routes.
 *
 * Registered through `ctx.inject` so they follow the web-server lifetime: they
 * are re-registered after a service replacement and removed with the plugin.
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
    scope.effect(
      () =>
        scope.webServer.register({
          kind: 'prefix',
          path: BRAIN_ROUTE,
          handler: createBrainHandler(),
        }),
      'desktop-pet-xiaojingniang: local-brain route',
    )
  })
}
