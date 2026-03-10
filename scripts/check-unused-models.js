import { getEnvironment } from "../config/contentful.js";

async function checkUnused() {
    try {
        const env = await getEnvironment();
        console.log(`Connected to environment: ${env.sys.id}`);

        let allContentTypes = [];
        let skip = 0;
        const limit = 100;
        let total = 0;

        do {
            const response = await env.getContentTypes({ skip, limit });
            allContentTypes = allContentTypes.concat(response.items);
            total = response.total;
            skip += limit;
        } while (allContentTypes.length < total);

        console.log(`\nFound ${allContentTypes.length} Content Models. Checking usage...\n`);

        const unused = [];
        const used = [];

        for (const ct of allContentTypes) {
            try {
                const entries = await env.getEntries({
                    content_type: ct.sys.id,
                    limit: 1
                });

                if (entries.total === 0) {
                    console.log(`❌ UNUSED : ${ct.name} (${ct.sys.id})`);
                    unused.push(ct);
                } else {
                    console.log(`✅ USED   : ${ct.name} (${entries.total} entries)`);
                    used.push(ct);
                }
            } catch (entryErr) {
                console.error(`Error checking entries for ${ct.sys.id}:`, entryErr.message);
            }
        }

        console.log("\n" + "=".repeat(40));
        console.log("SUMMARY");
        console.log("=".repeat(40));
        console.log(`Total Models: ${allContentTypes.length}`);
        console.log(`Used Models : ${used.length}`);
        console.log(`Unused Models: ${unused.length}`);
        console.log("=".repeat(40));

        if (unused.length > 0) {
            console.log("\nUnused Models List:");
            unused.forEach(ct => console.log(`- ${ct.name} (${ct.sys.id})`));
        }

        console.log("\nDone ✔\n");

    } catch (err) {
        console.error("Error:", err.message);
        if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    }
}

checkUnused();
