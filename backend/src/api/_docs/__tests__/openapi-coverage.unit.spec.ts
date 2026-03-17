import * as fs from "fs/promises"
import path from "path"

import { buildOpenApiDocument } from "../openapi"

const SERVER_LEVEL_PATHS = ["/health", "/health/ready", "/metrics"] as const

async function findRouteFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      out.push(...(await findRouteFiles(fullPath)))
      continue
    }

    if (entry.isFile() && (entry.name === "route.ts" || entry.name === "route.js")) {
      out.push(fullPath)
    }
  }

  return out
}

function routeFileToOpenApiPath(routeFile: string, apiRoot: string) {
  const relDir = path.relative(apiRoot, path.dirname(routeFile))
  const segments = relDir
    .split(path.sep)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"))

  return `/${segments.join("/")}`
}

describe("OpenAPI document coverage", () => {
  test("documents every implemented API path", async () => {
    const apiRoot = path.resolve(process.cwd(), "src", "api")
    const routeFiles = await findRouteFiles(apiRoot)

    const implementedPaths = new Set(
      routeFiles.map((routeFile) => routeFileToOpenApiPath(routeFile, apiRoot))
    )

    for (const serverPath of SERVER_LEVEL_PATHS) {
      implementedPaths.add(serverPath)
    }

    const document = buildOpenApiDocument({} as any)
    const documentedPaths = new Set(Object.keys((document as any).paths || {}))

    const missingInDocs = [...implementedPaths]
      .filter((implementedPath) => !documentedPaths.has(implementedPath))
      .sort()

    const missingInCode = [...documentedPaths]
      .filter((documentedPath) => !implementedPaths.has(documentedPath))
      .sort()

    expect(missingInDocs).toEqual([])
    expect(missingInCode).toEqual([])
  })
})
