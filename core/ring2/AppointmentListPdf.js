'use strict';

class AppointmentListPdf {
  /**
   * Gera um PDF com a lista de agendamentos locais de um parceiro
   * @param {string} partnerId ID do parceiro
   * @param {object} pmeConfigurator Instância do _sharedConfigurator ou similar
   * @param {object} pdfEngine Instância do PdfGeneratorEngine
   */
  static async generateAppointmentsPdf(partnerId, pmeConfigurator, pdfEngine, dateFilter = null) {
    if (!partnerId || !pmeConfigurator || !pdfEngine) {
      throw new Error('Parâmetros inválidos para geração de PDF de agendamentos.');
    }

    const config = pmeConfigurator.getAttendantConfig(partnerId);
    let appointments = config && config.existingAppointments ? config.existingAppointments : [];
    
    if (dateFilter) {
      appointments = appointments.filter(a => a.dateStr === dateFilter);
    }

    if (appointments.length === 0) {
      return pdfEngine.generatePdfReport({
        title: `Agendamentos - ${partnerId}`,
        content: 'Nenhum agendamento encontrado no banco de dados local.',
        type: 'AGENDAMENTOS_LOCAIS'
      });
    }

    // Ordenar agendamentos por data e horário
    const sorted = [...appointments].sort((a, b) => {
      const cmpDate = a.dateStr.localeCompare(b.dateStr);
      if (cmpDate !== 0) return cmpDate;
      return a.timeSlot.localeCompare(b.timeSlot);
    });

    let content = 'Lista de Agendamentos:\n\n';
    
    let currentDate = '';
    for (const appt of sorted) {
      if (appt.dateStr !== currentDate) {
        currentDate = appt.dateStr;
        content += `\n--- Data: ${currentDate} ---\n`;
      }
      let safeClient = (appt.clientName && !appt.clientName.startsWith('usr_'))
        ? appt.clientName
        : 'Cliente';

      if (appt.customerPhone) {
        let phone = String(appt.customerPhone).split('@')[0];
        phone = phone.replace(/\D/g, '');
        if (phone.startsWith('55') && phone.length >= 12) {
          phone = phone.substring(2);
        }
        if (phone.length === 11) {
          phone = `${phone.substring(0, 2)} ${phone.substring(2)}`;
        } else if (phone.length === 10) {
          phone = `${phone.substring(0, 2)} ${phone.substring(2)}`;
        }
        safeClient += ` (${phone})`;
      }

      const safeService = (appt.serviceName && appt.serviceName.length > 2)
        ? appt.serviceName
        : 'Serviço';

      content += `[${appt.timeSlot}] ${safeClient} - ${safeService}\n`;
    }

    return pdfEngine.generatePdfReport({
      title: `Agendamentos - ${partnerId}`,
      content: content,
      type: 'AGENDAMENTOS_LOCAIS'
    });
  }
}

module.exports = AppointmentListPdf;
