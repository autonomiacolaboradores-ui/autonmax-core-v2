const path = require('path');
const dbPath = path.join(__dirname, 'workspace', 'autonmax.db');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(dbPath);
const cols = db.prepare("PRAGMA table_info(user_accounts)").all();
console.log(cols);
