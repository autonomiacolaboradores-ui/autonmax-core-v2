const { PmeAgentConfigurator } = require('./core/ring1/PmeAgentConfigurator');
const PmeOrderTools = require('./core/ring2/PmeOrderTools');
const PdfGeneratorEngine = require('./core/ring1/PdfGeneratorEngine');
const OrderListPdf = require('./core/ring2/OrderListPdf');

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

  // Create a partner
  const partnerId = 'test_partner_pdf';
  
  // Create test order
  const orderArgs = {
    items: [
      { productName: 'Hambúrguer Artesanal', quantity: 2, unitPrice: 2500 },
      { productName: 'Refrigerante 2L', quantity: 1, unitPrice: 1000 }
    ],
    customerPhone: '5531997193229@s.whatsapp.net', // Formato WhatsApp Baileys
  };
  const clientName = 'João Carlos (WhatsApp)';
  
  // Call PmeOrderTools (simulating tool call by MaxAgentRuntime)
  PmeOrderTools.setConfigurator(pmeConfigurator);
  const result = await PmeOrderTools.createOrder({
    partnerId,
    clientName,
    ...orderArgs
  });
  console.log('Order confirmation result:', result);

  // Generate PDF
  const pdfResult = await OrderListPdf.generateOrdersPdf(partnerId, pmeConfigurator, pdfEngine);
  console.log('\nPDF Generation Result:');
  console.log('Title:', pdfResult.title);
  console.log('Content:\n', pdfResult.content || pdfResult.pdfContent || pdfResult.buffer || pdfResult);

  // Parse formatting in PDF content to see if "31 997193229" is what's displayed or "5531997193229"
  console.log('\n--- VERIFYING THE FIELDS ---');
}

runTest().catch(console.error);
