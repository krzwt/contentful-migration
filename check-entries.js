import { getEnvironment } from "./config/contentful.js";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const env = await getEnvironment();
  const ids = ["2501870", "2501631"];

  for (const id of ids) {
    console.log(`Searching for entryId ${id}...`);
    const entries = await env.getEntries({
      "fields.entryId": id,
    });
    if (entries.items.length > 0) {
      console.log(`Found ${entries.items.length} matches for ${id}:`);
      entries.items.forEach((item) => {
        console.log(
          ` - ${item.sys.id} (Type: ${item.sys.contentType.sys.id}) Title: ${item.fields.title?.["en-US"] || item.fields.name?.["en-US"]}`,
        );
      });
    } else {
      console.log(`No entries found for entryId ${id} using generic search.`);
    }
  }
}
run();
