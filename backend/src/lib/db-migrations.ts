import { ensureAppSchema } from "./bootstrap-schema"
import { pgQuery } from "./pg"

type AppMigration = {
  id: string
  description: string
  up: () => Promise<void>
}

const APP_MIGRATIONS: readonly AppMigration[] = [
  {
    id: "20260304_001_bootstrap_schema",
    description: "Bootstrap base ecommerce schema and indexes.",
    up: async () => {
      await ensureAppSchema()
    },
  },
  {
    id: "20260304_002_customer_favorites",
    description: "Create customer favorites table and indexes.",
    up: async () => {
      await ensureAppSchema()
    },
  },
  {
    id: "20260304_003_customer_lists",
    description: "Create customer lists tables and indexes.",
    up: async () => {
      await ensureAppSchema()
    },
  },
]

let runAppMigrationsPromise: Promise<void> | null = null

async function ensureMigrationTable() {
  await pgQuery(
    `create table if not exists "mp_schema_migration" (
      "id" text primary key,
      "description" text not null,
      "applied_at" timestamptz not null default now()
    );`
  )
}

function assertUniqueMigrationIds() {
  const ids = new Set<string>()
  for (const migration of APP_MIGRATIONS) {
    if (ids.has(migration.id)) {
      throw new Error(`Duplicate migration id: ${migration.id}`)
    }
    ids.add(migration.id)
  }
}

async function readAppliedMigrationIds() {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "mp_schema_migration"
     order by "applied_at" asc, "id" asc;`
  )

  return new Set(
    rows
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean)
  )
}

async function markMigrationAsApplied(migration: AppMigration) {
  await pgQuery(
    `insert into "mp_schema_migration" ("id","description","applied_at")
     values ($1,$2,now())
     on conflict ("id") do nothing;`,
    [migration.id, migration.description]
  )
}

export async function runAppMigrations() {
  if (runAppMigrationsPromise) return runAppMigrationsPromise

  runAppMigrationsPromise = (async () => {
    assertUniqueMigrationIds()
    await ensureMigrationTable()

    const applied = await readAppliedMigrationIds()
    for (const migration of APP_MIGRATIONS) {
      if (applied.has(migration.id)) continue

      console.log(`[db-migrations] applying ${migration.id} - ${migration.description}`)
      await migration.up()
      await markMigrationAsApplied(migration)
      console.log(`[db-migrations] applied ${migration.id}`)
    }
  })().catch((error) => {
    runAppMigrationsPromise = null
    throw error
  })

  return runAppMigrationsPromise
}
