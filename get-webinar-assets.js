import fs from "fs";
import { extractAssets } from "./utils/assetDetector.js";

const DATA_FILE = "./data/NEW-Webinars.json";

function getMissingAssets() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`File not found: ${DATA_FILE}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const allDetected = new Map();

  data.forEach(entry => {
    extractAssets(entry, allDetected);
  });

  console.log("Found Asset IDs:");
  console.log(Array.from(allDetected.keys()).join(", "));
  
  // Also format as a list for easy copying
  console.log("\nList format:");
  allDetected.forEach((info, id) => {
    console.log(`${id} (${info.type})`);
  });
}

getMissingAssets();
