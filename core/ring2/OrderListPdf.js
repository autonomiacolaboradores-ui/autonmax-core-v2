'use strict';

class OrderListPdf {
  /**
   * Gera um PDF com a lista de pedidos locais de um parceiro
   * @param {string} partnerId ID do parceiro
   * @param {object} pmeConfigurator Instância do PmeAgentConfigurator
   * @param {object} pdfEngine Instância do PdfGeneratorEngine
   * @param {string} dateFilter Opcional: filtro por data (YYYY-MM-DD)
   */
  static async generateOrdersPdf(partnerId, pmeConfigurator, pdfEngine, dateFilter = null) {
    if (!partnerId || !pmeConfigurator || !pdfEngine) {
      throw new Error('Parâmetros inválidos para geração de PDF de pedidos.');
    }

    const config = pmeConfigurator.getAttendantConfig(partnerId);
    let orders = config && config.existingOrders ? config.existingOrders : [];
    
    if (dateFilter) {
      // Se tiver data ISO, pegar apenas o prefixo YYYY-MM-DD
      orders = orders.filter(o => o.createdAt && o.createdAt.startsWith(dateFilter));
    }

    const reportDate = dateFilter || new Date().toISOString().split('T')[0];

    if (orders.length === 0) {
      return pdfEngine.generatePdfReport({
        title: `RELATÓRIO DE PEDIDOS - ${reportDate}`,
        content: `Parceiro: ${partnerId}\n\nNenhum pedido encontrado para o período especificado.`,
        type: 'PEDIDOS_LOCAIS'
      });
    }

    // Ordenar pedidos por data de criação
    const sorted = [...orders].sort((a, b) => {
      const cmpDate = (a.createdAt || '').localeCompare(b.createdAt || '');
      return cmpDate;
    });

    let content = `Parceiro: ${partnerId}\n`;
    content += `Data do Relatório: ${reportDate}\n\n`;
    
    let totalCentsAllOrders = 0;

    content += "ID do Pedido | Cliente | Itens (Resumo) | Valor Total | Status\n";
    content += "--------------------------------------------------------------------------------\n";

    for (const order of sorted) {
      const orderId = (order.orderId || order.id || '').split('_')[0] || 'N/A'; // Short ID
      
      let safeClient = (order.clientName && !order.clientName.startsWith('usr_'))
        ? order.clientName
        : 'Cliente';

      if (order.customerPhone) {
        const phone = String(order.customerPhone).split('@')[0];
        safeClient += ` (${phone})`;
      }

      const itemsSummary = Array.isArray(order.items) 
        ? order.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')
        : 'Sem itens';
        
      const status = order.status || 'PENDENTE';
      const totalReais = (order.totalCents / 100).toFixed(2).replace('.', ',');
      totalCentsAllOrders += (order.totalCents || 0);

      content += `${orderId} | ${safeClient} | ${itemsSummary} | R$ ${totalReais} | ${status}\n`;
    }

    content += "--------------------------------------------------------------------------------\n";
    const finalTotalReais = (totalCentsAllOrders / 100).toFixed(2).replace('.', ',');
    content += `VALOR TOTAL DE TODOS OS PEDIDOS: R$ ${finalTotalReais}\n`;

    return pdfEngine.generatePdfReport({
      title: `RELATÓRIO DE PEDIDOS - ${reportDate}`,
      content: content,
      type: 'PEDIDOS_LOCAIS'
    });
  }
}

module.exports = OrderListPdf;
