import { loadEnv } from "../lib/env"

import {
  CUSTOMER_ROLE_EMPLOYEE,
  CUSTOMER_ROLE_ADMINISTRATOR,
  CUSTOMER_ROLE_USER,
} from "../lib/customer-auth/constants"
import { getCustomerAuthPgService } from "../lib/customer-auth-pg-service"

type AllowedRole = "administrator" | "employee" | "user"

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

function parseRole(input: unknown): AllowedRole | null {
  if (typeof input !== "string") return null
  const value = input.trim().toLowerCase()
  if (value === CUSTOMER_ROLE_ADMINISTRATOR) return "administrator"
  if (value === CUSTOMER_ROLE_EMPLOYEE) return "employee"
  if (value === CUSTOMER_ROLE_USER) return "user"
  return null
}

export async function setAccountRole() {
  loadEnv()
  const service = getCustomerAuthPgService() as any

  const email = normalizeEmail(readArg("email"))
  const role = parseRole(readArg("role") || "administrator")

  if (!email || !email.includes("@")) {
    throw new Error("Valid --email is required.")
  }
  if (!role) {
    throw new Error("Valid --role is required (administrator|employee|user).")
  }

  const found = await service.listCustomerAccounts({ email }, { take: 1 })
  const account = found[0]
  if (!account) {
    throw new Error(`Account not found for email: ${email}`)
  }

  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: { role },
  })

  const refreshed = await service.listCustomerAccounts({ id: account.id }, { take: 1 })
  const current = refreshed[0]
  if (!current) {
    throw new Error("Account disappeared after update.")
  }

  console.log(
    `Role updated: ${email} -> ${String(current.role || "").toLowerCase()}`
  )
}

export default setAccountRole

if (require.main === module) {
  void setAccountRole().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
