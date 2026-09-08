const fs = require('fs');
const path = require('path');

const attendantsPath = path.join(__dirname, 'workspace', 'attendants_db.json');
if (fs.existsSync(attendantsPath)) {
  const data = JSON.parse(fs.readFileSync(attendantsPath, 'utf8'));
  for (const partnerId in data) {
    if (data[partnerId].existingAppointments) {
      data[partnerId].existingAppointments = [];
    }
  }
  fs.writeFileSync(attendantsPath, JSON.stringify(data, null, 2));
  console.log('Limpos agendamentos em attendants_db.json');
} else {
  console.log('attendants_db.json não encontrado.');
}

const draftsPath = path.join(__dirname, 'workspace', 'booking_drafts.json');
if (fs.existsSync(draftsPath)) {
  fs.writeFileSync(draftsPath, JSON.stringify({}));
  console.log('Limpos rascunhos em booking_drafts.json');
} else {
  console.log('booking_drafts.json não encontrado.');
}
