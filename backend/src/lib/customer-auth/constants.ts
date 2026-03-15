export const CUSTOMER_AUTH_MODULE = "customer_auth"

export const CUSTOMER_ACCESS_COOKIE = "store_customer_at"
export const CUSTOMER_REFRESH_COOKIE = "store_customer_rt"

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15 // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export const LOGIN_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_LOCK_MINUTES = 15

export const PASSWORD_RESET_TTL_MINUTES = 30

export const CART_MERGE_RULE = "session_priority"

export const CUSTOMER_ROLE_ADMINISTRATOR = "administrator" as const
export const CUSTOMER_ROLE_EMPLOYEE = "employee" as const
export const CUSTOMER_ROLE_USER = "user" as const

export const CUSTOMER_ROLES = [
  CUSTOMER_ROLE_ADMINISTRATOR,
  CUSTOMER_ROLE_EMPLOYEE,
  CUSTOMER_ROLE_USER,
] as const

export type CustomerRole = (typeof CUSTOMER_ROLES)[number]

