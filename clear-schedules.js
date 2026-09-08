const db = require('better-sqlite3')('workspace/autonmax.db');
try {
    const res1 = db.prepare('DELETE FROM pme_appointments').run();
    console.log(`Deletados ${res1.changes} registros de pme_appointments.`);
} catch (e) {
    console.log('Tabela pme_appointments não encontrada ou erro:', e.message);
}

try {
    const res2 = db.prepare('DELETE FROM reminders').run();
    console.log(`Deletados ${res2.changes} registros de reminders.`);
} catch (e) {
    console.log('Tabela reminders não encontrada ou erro:', e.message);
}

console.log('Memória de agendamentos limpa com sucesso.');
