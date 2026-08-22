import { db, GameTask } from "@acme/db";

async function main() {
  const rows = await db.select().from(GameTask);
  console.log(
    JSON.stringify(
      rows.map((r) => ({ id: r.id, title: r.title })),
      null,
      2,
    ),
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
