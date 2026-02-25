const fs = require('fs');
const content = fs.readFileSync('migration_log_cta_fixed.txt', 'utf16le');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('Detected "resourceTabbed" (ID: 2450870)'));
if (idx !== -1) {
    console.log(lines.slice(idx, idx + 25).join('\n'));
} else {
    console.log("Not found in lines");
}
