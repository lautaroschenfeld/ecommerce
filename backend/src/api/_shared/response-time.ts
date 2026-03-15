export function responseTimeMiddleware(req: any, res: any, next: any) {
  const startNs = process.hrtime.bigint()
  const originalWriteHead = res.writeHead

  res.writeHead = function writeHeadPatched(...args: any[]) {
    try {
      if (!res.getHeader("x-response-time-ms")) {
        const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000
        res.setHeader("x-response-time-ms", elapsedMs.toFixed(2))
      }
    } catch {
      // Ignore timing header errors and keep response flow.
    }
    return originalWriteHead.apply(this, args as any)
  }

  return next()
}
