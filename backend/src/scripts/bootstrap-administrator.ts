import crypto from "crypto"

import { loadEnv } from "../lib/env"

import {
  CUSTOMER_ROLE_ADMINISTRATOR,
  CUSTOMER_ROLE_USER,
} from "../lib/customer-auth/constants"
import { getCustomerAuthPgService } from "../lib/customer-auth-pg-service"
import {
  assertPasswordStrength,
  hashPassword,
  normalizeText,
} from "../api/store/catalog/_shared/customer-auth"

const BOOTSTRAP_SUCCESS_EVENT = "auth.bootstrap_administrator.success"

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

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex")
}

function timingSafeStringEqual(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function resolveProvidedToken() {
  return (
    readArg("token") ||
    process.env.BOOTSTRAP_ADMIN_TOKEN ||
    process.env.CUSTOMER_BOOTSTRAP_ADMIN_TOKEN ||
    ""
  ).trim()
}

function assertValidBootstrapToken(token: string) {
  const expectedHash = String(
    process.env.CUSTOMER_BOOTSTRAP_ADMIN_TOKEN_HASH || ""
  )
    .trim()
    .toLowerCase()
  const expectedPlain = String(process.env.CUSTOMER_BOOTSTRAP_ADMIN_TOKEN || "").trim()

  if (!expectedHash && !expectedPlain) {
    throw new Error(
      "Missing bootstrap token config. Set CUSTOMER_BOOTSTRAP_ADMIN_TOKEN_HASH (recommended) or CUSTOMER_BOOTSTRAP_ADMIN_TOKEN."
    )
  }

  if (!token) {
    throw new Error(
      "Missing bootstrap token. Pass --token <value> or set BOOTSTRAP_ADMIN_TOKEN."
    )
  }

  if (expectedHash) {
    const providedHash = sha256Hex(token)
    if (!timingSafeStringEqual(providedHash, expectedHash)) {
      throw new Error("Invalid bootstrap token.")
    }
    return providedHash
  }

  if (!timingSafeStringEqual(token, expectedPlain)) {
    throw new Error("Invalid bootstrap token.")
  }

  return sha256Hex(token)
}

export async function bootstrapAdministrator() {
  loadEnv()
  const service = getCustomerAuthPgService() as any

  const email = normalizeEmail(readArg("email"))
  const password = readArg("password")
  const firstName = normalizeText(readArg("first-name"), 80) || "Admin"
  const lastName = normalizeText(readArg("last-name"), 80) || ""

  if (!email || !email.includes("@")) {
    throw new Error("Valid --email is required.")
  }
  assertPasswordStrength(password)

  const providedToken = resolveProvidedToken()
  const tokenHash = assertValidBootstrapToken(providedToken)

  const alreadyBootstrapped = await service.listAuthAuditLogs(
    { event: BOOTSTRAP_SUCCESS_EVENT },
    { take: 1 }
  )
  if (alreadyBootstrapped[0]) {
    throw new Error(
      "Bootstrap token already consumed. Administrator bootstrap can only run once."
    )
  }

  const existingAdministrators = await service.listCustomerAccounts(
    { role: CUSTOMER_ROLE_ADMINISTRATOR },
    { take: 1 }
  )
  if (existingAdministrators[0]) {
    throw new Error(
      "An administrator already exists. Public users stay as 'user'; promote roles from admin panel."
    )
  }

  const existingAccount = await service.listCustomerAccounts({ email }, { take: 1 })
  const existing = existingAccount[0]

  if (existing) {
    await service.updateCustomerAccounts({
      selector: { id: existing.id },
      data: {
        role: CUSTOMER_ROLE_ADMINISTRATOR,
        password_hash: await hashPassword(password),
        first_name: firstName || existing.first_name || "Admin",
        last_name: lastName || existing.last_name || "",
        failed_login_count: 0,
        blocked_until: null,
        last_login_at: new Date(),
      },
    })
  } else {
    await service.createCustomerAccounts({
      email,
      password_hash: await hashPassword(password),
      first_name: firstName,
      last_name: lastName,
      phone: null,
      whatsapp: null,
      notifications: { email: true, whatsapp: false },
      role: CUSTOMER_ROLE_ADMINISTRATOR,
      failed_login_count: 0,
      blocked_until: null,
      last_login_at: new Date(),
    })
  }

  const refreshedList = await service.listCustomerAccounts({ email }, { take: 1 })
  const account = refreshedList[0]
  if (!account) {
    throw new Error("Administrator account was not found after bootstrap.")
  }

  const role = normalizeText(account.role, 24).toLowerCase()
  if (role !== CUSTOMER_ROLE_ADMINISTRATOR) {
    throw new Error("Bootstrap failed: resulting account is not administrator.")
  }

  await service.createAuthAuditLogs({
    account_id: account.id,
    event: BOOTSTRAP_SUCCESS_EVENT,
    success: true,
    ip_address: "script",
    user_agent: "bootstrap-administrator-script",
    metadata: {
      email,
      account_id: account.id,
      account_was_existing: Boolean(existing),
      forced_role_from: normalizeText(existing?.role, 24) || CUSTOMER_ROLE_USER,
      token_hash_prefix: tokenHash.slice(0, 12),
    },
  })

  console.log(`Administrator bootstrap completed for ${email}`)
}

export default bootstrapAdministrator

if (require.main === module) {
  void bootstrapAdministrator().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
