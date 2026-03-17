import crypto from "crypto"
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import { createServer } from "net"

export type StartedBackend = {
  baseUrl: string
  publishableApiKey: string
  stop: () => Promise<void>
}

type SharedState = {
  baseUrl?: string
  pid?: number
  refCount?: number
  port?: number
  publishableApiKey?: string
  bootError?: string
  bootErrorAt?: number
}

const GENERATED_TEST_PUBLISHABLE_KEY = `pk_${crypto.randomBytes(32).toString("hex")}`

function isValidPublishableApiKey(value: unknown) {
  const normalized = String(value || "").trim()
  return normalized.startsWith("pk_") && normalized.length >= 24
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function getSharedStatePath(backendRoot: string) {
  return path.resolve(backendRoot, ".integration-http-runtime.json")
}

function readSharedState(statePath: string): SharedState | null {
  try {
    if (!fs.existsSync(statePath)) return null
    const raw = fs.readFileSync(statePath, "utf8")
    const parsed = JSON.parse(raw) as SharedState
    if (!parsed || typeof parsed !== "object") return null
    return parsed
  } catch {
    return null
  }
}

function writeSharedState(statePath: string, state: SharedState) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state), "utf8")
  } catch {
    // Ignore best-effort cache writes.
  }
}

function clearSharedState(statePath: string) {
  try {
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath)
  } catch {
    // Ignore best-effort cache cleanup.
  }
}

function shouldReuseSharedServer() {
  const normalized = String(process.env.TEST_INTEGRATION_REUSE_SERVER || "")
    .trim()
    .toLowerCase()

  if (!normalized) return false
  return ["1", "true", "yes", "on"].includes(normalized)
}

function isProcessAlive(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function getPublishableApiKeyForIntegrationTests() {
  const candidates = [
    process.env.TEST_PUBLISHABLE_API_KEY,
    process.env.PUBLISHABLE_API_KEY,
    process.env.STORE_PUBLISHABLE_API_KEY,
    process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY,
  ]

  for (const candidate of candidates) {
    if (!isValidPublishableApiKey(candidate)) continue
    const key = String(candidate).trim()
    process.env.TEST_PUBLISHABLE_API_KEY = key
    process.env.PUBLISHABLE_API_KEY = key
    process.env.STORE_PUBLISHABLE_API_KEY = key
    process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY = key
    return key
  }

  process.env.TEST_PUBLISHABLE_API_KEY = GENERATED_TEST_PUBLISHABLE_KEY
  process.env.PUBLISHABLE_API_KEY = GENERATED_TEST_PUBLISHABLE_KEY
  process.env.STORE_PUBLISHABLE_API_KEY = GENERATED_TEST_PUBLISHABLE_KEY
  process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY = GENERATED_TEST_PUBLISHABLE_KEY
  return GENERATED_TEST_PUBLISHABLE_KEY
}

function spawnNpm(
  args: string[],
  input: { cwd: string; env?: NodeJS.ProcessEnv; detached?: boolean }
) {
  const isWindows = process.platform === "win32"

  return spawn("npm", args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...(input.env ?? {}),
    },
    stdio: "inherit",
    shell: isWindows,
    detached: Boolean(input.detached),
  })
}

async function runNpmScript(script: string, input: { cwd: string; env?: NodeJS.ProcessEnv }) {
  await new Promise<void>((resolve, reject) => {
    const proc = spawnNpm(["run", script], input)
    proc.once("error", reject)
    proc.once("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${script} failed with exit code ${code}`))
    })
  })
}

async function killProcessTreeByPid(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
      })
      killer.once("error", () => resolve())
      killer.once("exit", () => resolve())
    })
    return
  }

  const killSafe = (target: number, signal: NodeJS.Signals | 0) => {
    try {
      process.kill(target, signal)
      return true
    } catch {
      return false
    }
  }

  if (!killSafe(-pid, "SIGTERM")) {
    killSafe(pid, "SIGTERM")
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < 5000) {
    if (!isProcessAlive(pid)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  if (!killSafe(-pid, "SIGKILL")) {
    killSafe(pid, "SIGKILL")
  }
}

async function killProcessTree(proc: ChildProcess | undefined) {
  const pid = proc?.pid
  if (!pid) return
  if (proc.exitCode !== null) return
  await killProcessTreeByPid(pid)
}

async function stopSharedBackendIfLast(statePath: string) {
  const state = readSharedState(statePath)
  if (!state) return

  const currentRefs = toPositiveInt(state.refCount, 0)
  if (currentRefs > 1) {
    writeSharedState(statePath, {
      ...state,
      refCount: currentRefs - 1,
    })
    return
  }

  const pid = toPositiveInt(state.pid, 0)
  clearSharedState(statePath)
  await killProcessTreeByPid(pid)
}

export async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      server.close(() => resolve(port))
    })
  })
}

export async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const readyRes = await fetch(`${baseUrl}/health/ready`)
      if (readyRes.status === 200) return
    } catch {
      // Ignore while booting.
    }

    try {
      const healthRes = await fetch(`${baseUrl}/health`)
      if (healthRes.status === 200) return
    } catch {
      // Ignore while booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Backend did not become healthy within ${timeoutMs}ms: ${baseUrl}`)
}

export async function startBackendForIntegrationTests(input: {
  backendRoot: string
  extraEnv?: NodeJS.ProcessEnv
}) {
  const publishableApiKey = getPublishableApiKeyForIntegrationTests()
  const reuseSharedServer = shouldReuseSharedServer()
  const statePath = getSharedStatePath(input.backendRoot)
  const existingState = readSharedState(statePath)

  if (reuseSharedServer && existingState?.bootError) {
    const ageMs = Date.now() - toPositiveInt(existingState.bootErrorAt, 0)
    if (ageMs < 60_000) {
      throw new Error(existingState.bootError)
    }
    clearSharedState(statePath)
  }

  if (reuseSharedServer && existingState?.baseUrl) {
    const pid = toPositiveInt(existingState.pid, 0)
    if (pid > 0 && !isProcessAlive(pid)) {
      clearSharedState(statePath)
    } else {
      try {
        await waitForHealth(existingState.baseUrl, 2_500)
        const sharedPublishableApiKey = isValidPublishableApiKey(existingState.publishableApiKey)
          ? String(existingState.publishableApiKey).trim()
          : publishableApiKey
        process.env.TEST_PUBLISHABLE_API_KEY = sharedPublishableApiKey
        process.env.PUBLISHABLE_API_KEY = sharedPublishableApiKey
        process.env.STORE_PUBLISHABLE_API_KEY = sharedPublishableApiKey
        process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY = sharedPublishableApiKey
        const nextRefs = toPositiveInt(existingState.refCount, 0) + 1
        writeSharedState(statePath, {
          ...existingState,
          publishableApiKey: sharedPublishableApiKey,
          refCount: nextRefs,
        })

        return {
          baseUrl: existingState.baseUrl,
          publishableApiKey: sharedPublishableApiKey,
          stop: () => stopSharedBackendIfLast(statePath),
        } satisfies StartedBackend
      } catch {
        await killProcessTreeByPid(pid)
        clearSharedState(statePath)
      }
    }
  }

  const env = {
    NODE_ENV: "test",
    ALLOW_DEV_RESET_TOKEN: "true",
    PUBLISHABLE_API_KEY: publishableApiKey,
    STORE_PUBLISHABLE_API_KEY: publishableApiKey,
    NEXT_PUBLIC_PUBLISHABLE_API_KEY: publishableApiKey,
    ...(input.extraEnv ?? {}),
  }

  try {
    await runNpmScript("build", { cwd: input.backendRoot, env })
    await runNpmScript("seed", { cwd: input.backendRoot, env })
  } catch (error) {
    writeSharedState(statePath, {
      bootError:
        error instanceof Error ? error.message : "Integration backend bootstrap failed.",
      bootErrorAt: Date.now(),
    })
    throw error
  }

  const port = reuseSharedServer
    ? toPositiveInt(existingState?.port, 0) || (await getFreePort())
    : await getFreePort()
  const baseUrl = `http://localhost:${port}`

  const proc = spawnNpm(["run", "start"], {
    cwd: input.backendRoot,
    env: {
      ...env,
      PORT: String(port),
    },
    detached: process.platform !== "win32",
  })

  try {
    await waitForHealth(baseUrl, 90_000)
  } catch (error) {
    await killProcessTree(proc)
    writeSharedState(statePath, {
      bootError:
        error instanceof Error ? error.message : "Integration backend did not become healthy.",
      bootErrorAt: Date.now(),
    })
    throw error
  }

  if (reuseSharedServer && proc.pid) {
    writeSharedState(statePath, {
      baseUrl,
      pid: proc.pid,
      refCount: 1,
      port,
      publishableApiKey,
    })
  } else if (reuseSharedServer) {
    clearSharedState(statePath)
  }

  let stopped = false

  return {
    baseUrl,
    publishableApiKey,
    stop: async () => {
      if (stopped) return
      stopped = true

      if (reuseSharedServer) {
        await stopSharedBackendIfLast(statePath)
        return
      }

      await killProcessTree(proc)
    },
  } satisfies StartedBackend
}
