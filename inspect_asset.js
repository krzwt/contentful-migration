import "dotenv/config";
import { getEnvironment } from "./config/contentful.js";
import fs from "fs";

async function inspectAsset() {
    const env = await getEnvironment();
    const asset = await env.getAsset("asset-2495493");
    fs.writeFileSync("asset_inspect.json", JSON.stringify(asset, null, 2));
    console.log("Written to asset_inspect.json");
}

inspectAsset().catch(console.error);
