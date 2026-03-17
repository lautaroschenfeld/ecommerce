const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

function killProcessTreeByPid(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    })
    return
  }

  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Ignore missing process.
    }
  }
}

module.exports = async () => {
  const backendRoot = path.resolve(__dirname, "../..")
  const statePath = path.resolve(backendRoot, ".integration-http-runtime.json")

  if (!fs.existsSync(statePath)) return

  let pid = 0
  try {
    const raw = fs.readFileSync(statePath, "utf8")
    const parsed = JSON.parse(raw)
    const value = Number(parsed?.pid)
    if (Number.isFinite(value) && value > 0) {
      pid = Math.trunc(value)
    }
  } catch {
    // Ignore invalid file format.
  }

  try {
    fs.unlinkSync(statePath)
  } catch {
    // Ignore best-effort cleanup.
  }

  if (pid > 0) {
    killProcessTreeByPid(pid)
  }
}

