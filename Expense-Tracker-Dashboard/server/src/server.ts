import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { app } from "./app.js";

async function main() {
  await prisma.$connect();
  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server.");
  if (env.NODE_ENV !== "production") {
    console.error(error);
  }
  process.exit(1);
});
