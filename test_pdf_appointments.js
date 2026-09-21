const { PmeAgentConfigurator } = require('./core/ring1/PmeAgentConfigurator');
const PmeBookingTools = require('./core/ring2/PmeBookingTools');
const AppointmentListPdf = require('./core/ring2/AppointmentListPdf');

async function runTest() {
  const pmeConfigurator = new PmeAgentConfigurator();
  
  const pdfEngine = {
    generatePdfReport: (args) => {
      console.log('\n--- PDF CONTENT INTERCEPTED ---');
      console.log(args.content);
      console.log('-------------------------------\n');
      return args;
    }
  };

  const partnerId = 'test_partner_pdf';
  
  // Need to set configurator for PmeBookingTools
  PmeBookingTools.setConfigurator(pmeConfigurator);

  // Setup mock service
  const config = pmeConfigurator.getAttendantConfig(partnerId);
  config.services = [
    { name: 'Corte de Cabelo', durationMinutes: 30, priceCents: 5000, keywords: ['corte'] }
  ];

  // Create test appointment
  const bookArgs = {
    partnerId,
    clientName: 'Maria Silva (WhatsApp)',
    customerPhone: '5531997193229@s.whatsapp.net',
    serviceName: 'Corte de Cabelo',
    dateStr: '2026-09-22',
    timeSlot: '10:00'
  };
  
  const result = await PmeBookingTools.createAppointment(bookArgs);
  console.log('Booking confirmation result:', result);

  // Generate PDF
  const pdfResult = await AppointmentListPdf.generateAppointmentsPdf(partnerId, pmeConfigurator, pdfEngine);
  console.log('\nPDF Generation Result:');
  console.log('Title:', pdfResult.title);
}

runTest().catch(console.error);
