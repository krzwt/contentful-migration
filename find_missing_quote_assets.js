import fs from "fs";

const ASSET_METADATA_FILES = ["./data/assets.json", "./data/people-assets.json"];
const QUOTES_FILE = "./data/company-quotes.json";

function findMissingAssets() {
    const existing = new Set();
    ASSET_METADATA_FILES.forEach(file => {
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            data.forEach(item => existing.add(String(item.id)));
        }
    });

    const quotes = JSON.parse(fs.readFileSync(QUOTES_FILE, "utf8"));
    const missing = new Set();

    quotes.forEach(quote => {
        if (quote.quoteLogo && Array.isArray(quote.quoteLogo)) {
            quote.quoteLogo.forEach(id => {
                if (!existing.has(String(id))) {
                    missing.add(String(id));
                }
            });
        }
    });

    console.log(`\n🔍 Found ${missing.size} missing assets in Company Quotes:`);
    console.log(Array.from(missing).join(", "));
}

findMissingAssets();
