const fs = require('fs');
const path = require('path');

// Recursively find .db files
function findDbFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findDbFiles(filePath, fileList);
        } else if (filePath.endsWith('.db') || filePath.endsWith('.sqlite')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const dbFiles = findDbFiles(__dirname + '/..');
console.log('Found DB files:', dbFiles);

if (dbFiles.length > 0) {
    try {
        const Database = require('better-sqlite3');
        for (const file of dbFiles) {
            console.log(`Checking ${file}...`);
            const db = new Database(file);
            
            // Get all tables
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            
            for (const table of tables) {
                const tableName = table.name;
                try {
                    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
                    for (const row of rows) {
                        const rowStr = JSON.stringify(row);
                        if (rowStr.includes('intro-autonomia') || rowStr.includes('assets/video')) {
                            console.log(`FOUND IN TABLE ${tableName}:`, rowStr);
                            
                            // Let's try to update it dynamically
                            // This is just a read check for now
                        }
                    }
                } catch (e) {
                    console.log(`Error reading table ${tableName}:`, e.message);
                }
            }
        }
    } catch (err) {
        console.error('Error loading better-sqlite3 or reading DB:', err.message);
    }
}
