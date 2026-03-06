import { getEnvironment } from "./config/contentful.js";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const env = await getEnvironment();
  const id = "1323793";

  console.log(`\nSearching for entryId ${id}...`);
  const entries = await env.getEntries({
    "fields.entryId": id,
  });
  if (entries.items.length > 0) {
    console.log(`Found ${entries.items.length} matches for ${id}:`);
    entries.items.forEach((item) => {
      console.log(`- Entry: ${item.sys.id}`);
      console.log(`  Fields: ${JSON.stringify(item.fields, null, 2)}`);
    });
  } else {
    console.log(`No entries found for entryId ${id}.`);
  }
}
run().catch(err => console.error(err));
