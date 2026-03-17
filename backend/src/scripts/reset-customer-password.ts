import { loadEnv } from "../lib/env"

import { getCustomerAuthPgService } from "../lib/customer-auth-pg-service"
import {
  assertPasswordStrength,
  hashPassword,
} from "../api/store/catalog/_shared/customer-auth"

function readArg(name: string) {
  const key = `--${name}`
  const idx = process.argv.findIndex((entry) => entry === key)
  if (idx < 0) return ""
  const value = process.argv[idx + 1]
  if (!value || value.startsWith("--")) return ""
  return String(value).trim()
}

function normalizeEmail(input: unknown) {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

export async function resetCustomerPassword() {
  loadEnv()

  const email = normalizeEmail(readArg("email"))
  const password = String(readArg("password") || "").trim()

  if (!email) {
    throw new Error("Missing --email <value>")
  }
  if (!password) {
    throw new Error("Missing --password <value>")
  }

  assertPasswordStrength(password)

  const service = getCustomerAuthPgService() as any
  const [account] = (await service.listCustomerAccounts({ email }, { take: 1 })) as any[]

  if (!account) {
    throw new Error(`No customer account found for email: ${email}`)
  }

  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: {
      password_hash: await hashPassword(password),
      failed_login_count: 0,
      blocked_until: null,
    },
  })

  console.log(`Password updated for ${email}`)
}

if (require.main === module) {
  resetCustomerPassword().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
