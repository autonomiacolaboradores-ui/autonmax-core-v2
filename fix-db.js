const db = require('better-sqlite3')('workspace/autonmax.db');
try {
  db.exec('ALTER TABLE user_accounts ADD COLUMN is_partner INTEGER DEFAULT 0');
  console.log('is_partner added successfully');
} catch(err) {
  console.error('Error adding column:', err.message);
}
