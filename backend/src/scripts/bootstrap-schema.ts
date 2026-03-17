import "../lib/env"

import { runAppMigrations } from "../lib/db-migrations"

export async function bootstrapSchema() {
  await runAppMigrations()
  console.log("Database migrations applied.")
}

if (require.main === module) {
  void bootstrapSchema().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
