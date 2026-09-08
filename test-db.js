const { DatabaseSync } = require('node:sqlite');
try {
  const db = new DatabaseSync('workspace/autonmax.db', { open: true });
  const rows = db.prepare('SELECT partner_id, business_rules FROM pme_configs_v2').all();
  console.log(JSON.stringify(rows, null, 2));
} catch(e) {
  console.error(e);
}
