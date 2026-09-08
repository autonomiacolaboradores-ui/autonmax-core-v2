const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('workspace/autonmax.db');

db.serialize(() => {
  db.run('DELETE FROM pme_appointments', function(err) {
    if (err) {
      console.log('Erro ao deletar pme_appointments:', err.message);
    } else {
      console.log(`Deletados registros de pme_appointments.`);
    }
  });

  db.run('DELETE FROM reminders', function(err) {
    if (err) {
      console.log('Erro ao deletar reminders:', err.message);
    } else {
      console.log(`Deletados registros de reminders.`);
    }
  });
});

db.close(() => {
  console.log('Memória de agendamentos limpa no banco.');
});
