const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/edini/Desktop/max_atendente_certificado/workspace/autonmax.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("Tables:");
    rows.forEach(row => {
      console.log(row.name);
    });
  }
});

db.close();
