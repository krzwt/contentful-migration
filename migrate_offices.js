import fs from 'fs';
import { getEnvironment } from "./config/contentful.js";
import { migrateGlobalReachMap } from "./handlers/newGlobalReachMap.js";

async function run() {
    const env = await getEnvironment();
    const data = JSON.parse(fs.readFileSync('./data/newGlobalReachMap.json', 'utf-8'));

    // Process only Office entries
    const offices = data.filter(i => i.globalReachType === 'office');
    console.log(`Processing ${offices.length} offices...`);

    await migrateGlobalReachMap(env, offices);
    console.log('\nMigration complete.');
}

run().catch(console.error);
