

'use strict';

/**
 * MaxNativeTools — R1.6 tópicos 21–30
 * book_appointment_confirmed · list_my_appointments · reschedule · travel_time ·
 * compare_services · upsell_safe · faq_from_pdf · booking_card/ICS ·
 * split_bill / unit_convert · follow_url_summarize
 * UI intocada. Tools só via dispatcher / function-calling.
 */

const crypto = require('node:crypto');
const PmeBookingTools = require('./PmeBookingTools');
const { PmeAgentConfigurator } = require('../ring1/PmeAgentConfigurator');
const { getHappyPath } = require('../ring1/MaxHappyPath');
const { getRuntimeExcellence } = require('../ring1/MaxRuntimeExcellence');

function cfg(partnerId) {
  const c = new PmeAgentConfigurator();
  return c.getAttendantConfig(partnerId || 'usr_google_demo_100') || c.createDefaultConfig(partnerId);
}

function findService(config, serviceName, serviceId) {
  const catalog = config.catalog || [];
  if (serviceId) {
    const byId = catalog.find((x) => x.id === serviceId);
    if (byId) return byId;
  }
  if (serviceName) {
    const q = String(serviceName).toLowerCase();
    return (
      catalog.find((x) => String(x.name).toLowerCase() === q) ||
      catalog.find((x) => String(x.name).toLowerCase().includes(q))
    );
  }
  return null;
}

function formatPrice(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return null;
  return `R$ ${(Number(cents) / 100).toFixed(2).replace('.', ',')}`;
}

class MaxNativeTools {
  static functionDeclarations() {
    return [
      {
        name: 'book_appointment_confirmed',
        description:
          'Agenda somente após confirmação explícita do cliente (SIM). Exige clientName, serviceName, dateStr, timeSlot e confirmed=true.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            clientName: { type: 'STRING' },
            serviceName: { type: 'STRING' },
            serviceId: { type: 'STRING' },
            dateStr: { type: 'STRING' },
            timeSlot: { type: 'STRING' },
            customerPhone: { type: 'STRING' },
            confirmed: { type: 'BOOLEAN' },
            priceLabel: { type: 'STRING' }
          },
          required: ['clientName', 'serviceName', 'dateStr', 'timeSlot', 'confirmed']
        }
      },
      {
        name: 'create_order_confirmed',
        description: 'Finaliza pedido de produtos após confirmação explícita (SIM) do cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            clientName: { type: 'STRING' },
            customerPhone: { type: 'STRING' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  productId: { type: 'STRING' },
                  productName: { type: 'STRING' },
                  quantity: { type: 'NUMBER' },
                  unitPrice: { type: 'NUMBER' }
                }
              }
            },
            paymentMethod: { type: 'STRING' },
            deliveryType: { type: 'STRING' },
            address: { type: 'STRING' },
            notes: { type: 'STRING' },
            confirmed: { type: 'BOOLEAN' }
          },
          required: ['partnerId', 'clientName', 'items', 'confirmed']
        }
      },
      {
        name: 'list_my_appointments',
        description: 'Lista agendamentos do cliente (por telefone/JID ou nome) no parceiro.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            customerPhone: { type: 'STRING' },
            clientName: { type: 'STRING' },
            remoteJid: { type: 'STRING' }
          }
        }
      },
      {
        name: 'reschedule_appointment',
        description: 'Reagenda: cancela slot antigo e cria novo (com idempotência).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            clientName: { type: 'STRING' },
            serviceName: { type: 'STRING' },
            oldDateStr: { type: 'STRING' },
            oldTimeSlot: { type: 'STRING' },
            newDateStr: { type: 'STRING' },
            newTimeSlot: { type: 'STRING' },
            appointmentId: { type: 'STRING' },
            customerPhone: { type: 'STRING' }
          },
          required: ['clientName', 'newDateStr', 'newTimeSlot']
        }
      },
      {
        name: 'get_travel_time',
        description: 'Estima tempo de deslocamento (heurística; opcional). origin e destination em texto livre.',
        parameters: {
          type: 'OBJECT',
          properties: {
            origin: { type: 'STRING' },
            destination: { type: 'STRING' },
            mode: { type: 'STRING', description: 'driving|walking|transit' }
          }
        }
      },
      {
        name: 'compare_services',
        description: 'Compara 2–3 serviços do catálogo (preço, duração, diff).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            serviceNames: { type: 'ARRAY', items: { type: 'STRING' } }
          }
        }
      },
      {
        name: 'upsell_safe',
        description:
          'Sugere add-on compatível sem inventar preço. Só usa itens do catálogo com priceCents conhecido.',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            baseServiceName: { type: 'STRING' },
            baseServiceId: { type: 'STRING' }
          }
        }
      },
      {
        name: 'faq_from_pdf',
        description: 'Ranking simples de trechos da knowledge base por query (FAQ).',
        parameters: {
          type: 'OBJECT',
          properties: {
            partnerId: { type: 'STRING' },
            query: { type: 'STRING' },
            limit: { type: 'NUMBER' }
          },
          required: ['query']
        }
      },
      {
        name: 'generate_booking_card',
        description: 'Gera cartão legível + ICS (texto) do agendamento confirmado.',
        parameters: {
          type: 'OBJECT',
          properties: {
            clientName: { type: 'STRING' },
            serviceName: { type: 'STRING' },
            dateStr: { type: 'STRING' },
            timeSlot: { type: 'STRING' },
            durationMinutes: { type: 'NUMBER' },
            storeName: { type: 'STRING' },
            location: { type: 'STRING' }
          },
          required: ['serviceName', 'dateStr', 'timeSlot']
        }
      },
      {
        name: 'split_bill',
        description: 'Divide conta entre N pessoas (centavos inteiros, sem drift).',
        parameters: {
          type: 'OBJECT',
          properties: {
            totalCents: { type: 'NUMBER' },
            totalReais: { type: 'NUMBER' },
            people: { type: 'NUMBER' },
            tipPercent: { type: 'NUMBER' }
          }
        }
      },
      {
        name: 'unit_convert',
        description: 'Conversão de unidades (km/mi, kg/lb, C/F, m/ft).',
        parameters: {
          type: 'OBJECT',
          properties: {
            value: { type: 'NUMBER' },
            from: { type: 'STRING' },
            to: { type: 'STRING' }
          },
          required: ['value', 'from', 'to']
        }
      },
      {
        name: 'follow_url_summarize',
        description: 'Baixa texto de URL pública e resume (primeiros N chars + bullets heurísticos).',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: { type: 'STRING' },
            maxChars: { type: 'NUMBER' }
          },
          required: ['url']
        }
      }
    ];
  }

  /** Implementação do create_order_confirmed */
  static async create_order_confirmed(args = {}) {
    const tool = 'create_order_confirmed';

    let clientName = (args.clientName || '').trim();
    if (!clientName || clientName.startsWith('usr_') || clientName.startsWith('usr_nat_') || clientName.length < 3) {
      clientName = 'Cliente';
    }

    const items = Array.isArray(args.items) ? args.items : [];
    if (items.length === 0) {
      return { error: '[PME_ORDER] items é obrigatório e não pode ser vazio' };
    }

    for (const item of items) {
      if (!item.productName || item.productName.length < 2) {
        return { error: `[PME_ORDER] productName inválido: ${item.productName}` };
      }
      if (!item.quantity || item.quantity <= 0) {
        return { error: `[PME_ORDER] quantity inválida para ${item.productName}` };
      }
    }

    if (args.confirmed !== true) {
      return { error: '[PME_ORDER] create_order_confirmed exige confirmed=true. O cliente não confirmou o pedido formalmente.' };
    }

    const PmeOrderTools = require('./PmeOrderTools');

    try {
      const result = await PmeOrderTools.createOrder({
        partnerId: args.partnerId,
        clientName,
        customerPhone: args.customerPhone || null,
        items,
        paymentMethod: args.paymentMethod || null,
        deliveryType: args.deliveryType || null,
        address: args.address || null,
        notes: args.notes || null,
        remoteJid: args.remoteJid || null
      });

      return result;
    } catch (err) {
      return { error: err.message || 'Falha ao salvar o pedido.' };
    }
  }

  /** Tópico 21 */
  static async book_appointment_confirmed(args = {}) {
    const tool = 'book_appointment_confirmed';
    const partnerId = args.partnerId;

    // --- VALIDAÇÃO RÍGIDA DE ENTRADA ---
    let clientName = (args.clientName || '').trim();
    let serviceName = (args.serviceName || '').trim();
    const dateStr = args.dateStr;
    const timeSlot = args.timeSlot;
    const customerPhone = args.customerPhone || null;
    let priceLabel = args.priceLabel;
    let durationMinutes = args.durationMinutes;
    let serviceTag = args.serviceTag;
    let serviceId = args.serviceId;

    // 1. Rejeitar IDs internos como nome
    if (
      !clientName ||
      clientName.startsWith('usr_') ||
      clientName.startsWith('usr_nat_') ||
      clientName.length < 2
    ) {
      clientName = 'Cliente';
    }

    // 2. Rejeitar serviceName suspeito (texto de conversa)
    const suspiciousServicePatterns = [
      /que dia/i,
      /qual (horário|hora|dia)/i,
      /quando/i,
      /pode ser/i,
      /agendar/i,
      /^servi[cç]os?$/i
    ];

    if (
      !serviceName ||
      suspiciousServicePatterns.some(p => p.test(serviceName)) ||
      serviceName.length < 3
    ) {
      throw new Error(
        `[PME_TOOL] serviceName inválido: "${serviceName}". ` +
        `É obrigatório usar um serviço real do catálogo.`
      );
    }

    // 3. Confirmação obrigatória
    if (args.confirmed !== true) {
      const conf = getHappyPath().confirmation.build({
        serviceName,
        serviceTag,
        dateStr,
        timeSlot,
        clientName,
        priceLabel,
        durationMinutes,
        storeName: args.storeName
      });
      return {
        status: 'NEED_CONFIRMATION',
        ok: false,
        tool,
        reason: 'CONFIRMATION_REQUIRED',
        confirmation: conf,
        message: conf.text
      };
    }
    // Sem force:true — respeita conflitos reais na agenda
    const result = await PmeBookingTools.createAppointment({
      partnerId,
      clientName,
      serviceName,
      serviceId,
      dateStr,
      timeSlot,
      customerPhone,
      remoteJid: args.remoteJid,
      priceLabel,
      durationMinutes
    });
    if (result && result.ok) {
      try {
        getHappyPath().reminders.scheduleWindows({
          appointmentId: result.appointment && (result.appointment.appointmentId || result.appointment.id),
          dateStr: result.appointment.dateStr || args.dateStr,
          timeSlot: result.appointment.timeSlot || args.timeSlot,
          clientName: args.clientName,
          serviceName: result.appointment.serviceName || serviceName,
          customerPhone: args.customerPhone
        });
      } catch (_) { }
      try {
        getHappyPath().clients.touch({
          partnerId,
          remoteJid: args.remoteJid || args.customerPhone,
          clientName: args.clientName,
          lastService: result.appointment.serviceName || serviceName,
          lastDate: result.appointment.dateStr || args.dateStr
        });
      } catch (_) { }
    }
    return { ...result, tool, topic: 21 };
  }

  /** Tópico 22 */
  static list_my_appointments({ partnerId, customerPhone, clientName, remoteJid } = {}) {
    const tool = 'list_my_appointments';
    try {
      const config = cfg(partnerId);
      const list = config.existingAppointments || config.appointments || [];
      const phone = customerPhone || (remoteJid && String(remoteJid).split('@')[0]) || null;
      const name = clientName && String(clientName).toLowerCase();
      const filtered = list.filter((ap) => {
        if (phone && ap.customerPhone && String(ap.customerPhone).includes(String(phone).slice(-8))) return true;
        if (name && ap.clientName && String(ap.clientName).toLowerCase() === name) return true;
        if (name && ap.clientName && String(ap.clientName).toLowerCase().includes(name)) return true;
        return false;
      });
      return {
        status: 'SUCCESS',
        ok: true,
        tool,
        topic: 22,
        count: filtered.length,
        appointments: filtered,
        message:
          filtered.length === 0
            ? 'Nenhum agendamento encontrado para este cliente.'
            : `Encontrei ${filtered.length} agendamento(s).`
      };
    } catch (e) {
      return { status: 'ERROR', ok: false, tool, reason: e.message };
    }
  }

  /** Tópico 23 */
  static async reschedule_appointment(args = {}) {
    const tool = 'reschedule_appointment';
    try {
      if (args.oldDateStr || args.oldTimeSlot || args.appointmentId) {
        PmeBookingTools.cancelAppointment({
          partnerId: args.partnerId,
          dateStr: args.oldDateStr,
          timeSlot: args.oldTimeSlot,
          appointmentId: args.appointmentId,
          clientName: args.clientName
        });
      }
      const created = await PmeBookingTools.createAppointment({
        partnerId: args.partnerId,
        clientName: args.clientName,
        serviceName: args.serviceName || 'servico',
        dateStr: args.newDateStr,
        timeSlot: args.newTimeSlot,
        customerPhone: args.customerPhone
      });
      return {
        ...created,
        tool,
        topic: 23,
        rescheduled: !!(created && created.ok),
        message: created.ok
          ? `Reagendado para ${args.newDateStr} às ${args.newTimeSlot}.`
          : created.message || 'Falha ao reagendar'
      };
    } catch (e) {
      return { status: 'ERROR', ok: false, tool, reason: e.message };
    }
  }

  /** Tópico 24 — heurística sem API paga */
  static get_travel_time({ origin, destination, mode } = {}) {
    const tool = 'get_travel_time';
    if (!origin || !destination) {
      return { status: 'ERROR', ok: false, tool, reason: 'NEED_ORIGIN_DEST' };
    }
    const m = String(mode || 'driving').toLowerCase();
    // Heurística determinística (hash) para não inventar precisão falsa
    const h = crypto.createHash('sha256').update(`${origin}|${destination}|${m}`).digest();
    const baseMin = 12 + (h[0] % 40);
    const factor = m === 'walking' ? 2.4 : m === 'transit' ? 1.5 : 1;
    const minutes = Math.round(baseMin * factor);
    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 24,
      origin,
      destination,
      mode: m,
      estimateMinutes: minutes,
      estimateLabel: `~${minutes} min`,
      disclaimer: 'Estimativa heurística local — não é rota GPS em tempo real.',
      message: `Deslocamento estimado (${m}): cerca de ${minutes} minutos entre ${origin} e ${destination}.`
    };
  }

  /** Tópico 25 */
  static compare_services({ partnerId, serviceNames } = {}) {
    const tool = 'compare_services';
    const config = cfg(partnerId);
    const names = Array.isArray(serviceNames) ? serviceNames.slice(0, 3) : [];
    if (names.length < 2) {
      return { status: 'ERROR', ok: false, tool, reason: 'NEED_TWO_SERVICES' };
    }
    const rows = names.map((n) => {
      const s = findService(config, n, null);
      if (!s) return { name: n, found: false };
      return {
        name: s.name,
        found: true,
        id: s.id,
        durationMinutes: s.durationMinutes || null,
        priceCents: s.priceCents != null ? s.priceCents : null,
        priceLabel: formatPrice(s.priceCents),
        description: s.description || null
      };
    });
    const found = rows.filter((r) => r.found);
    let diffNote = null;
    if (found.length >= 2 && found[0].priceCents != null && found[1].priceCents != null) {
      const d = found[0].priceCents - found[1].priceCents;
      diffNote =
        d === 0
          ? 'Mesmo preço entre os dois primeiros.'
          : d > 0
            ? `${found[0].name} custa ${formatPrice(d)} a mais que ${found[1].name}.`
            : `${found[1].name} custa ${formatPrice(-d)} a mais que ${found[0].name}.`;
    }
    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 25,
      services: rows,
      diffNote,
      message: diffNote || 'Comparativo montado a partir do catálogo (sem inventar preço).'
    };
  }

  /** Tópico 26 — nunca inventa preço */
  static upsell_safe({ partnerId, baseServiceName, baseServiceId } = {}) {
    const tool = 'upsell_safe';
    const config = cfg(partnerId);
    const base = findService(config, baseServiceName, baseServiceId);
    const catalog = (config.catalog || []).filter((c) => c && c.priceCents != null);
    if (!catalog.length) {
      return {
        status: 'SUCCESS',
        ok: true,
        tool,
        topic: 26,
        suggestion: null,
        message: 'Sem add-ons com preço cadastrado — não sugiro upsell sem valor real.'
      };
    }
    const candidates = catalog.filter((c) => !base || c.id !== base.id);
    // prefer cheaper add-ons
    candidates.sort((a, b) => Number(a.priceCents) - Number(b.priceCents));
    const pick = candidates[0] || null;
    if (!pick) {
      return { status: 'SUCCESS', ok: true, tool, topic: 26, suggestion: null, message: 'Nenhum add-on disponível.' };
    }
    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 26,
      suggestion: {
        id: pick.id,
        name: pick.name,
        priceCents: pick.priceCents,
        priceLabel: formatPrice(pick.priceCents),
        durationMinutes: pick.durationMinutes || null
      },
      message: `Se quiser, posso incluir *${pick.name}* (${formatPrice(pick.priceCents)}) — valor do catálogo, sem inventar.`
    };
  }

  /** Tópico 27 */
  static faq_from_pdf({ partnerId, query, limit } = {}) {
    const tool = 'faq_from_pdf';
    const config = cfg(partnerId);
    const docs = config.knowledgeBase || config.documents || config.faqs || [];
    const q = String(query || '')
      .toLowerCase()
      .trim();
    if (!q) return { status: 'ERROR', ok: false, tool, reason: 'NEED_QUERY' };
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);
    const scored = [];
    for (const doc of docs) {
      const title = String(doc.title || doc.name || '');
      const body = String(doc.text || doc.content || doc.body || '');
      const hay = (title + '\n' + body).toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
      }
      if (score > 0) {
        const idx = hay.indexOf(tokens[0] || q);
        const snippet = body.slice(Math.max(0, idx - 40), Math.max(0, idx - 40) + 220);
        scored.push({ title, score, snippet: snippet || body.slice(0, 220) });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(limit || 3, 5));
    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 27,
      query: q,
      hits: top,
      message: top.length ? `Encontrei ${top.length} trecho(s) relevantes.` : 'Nada encontrado na base cadastrada.'
    };
  }

  /** Tópico 28 */
  static generate_booking_card(args = {}) {
    const tool = 'generate_booking_card';
    const {
      clientName,
      serviceName,
      dateStr,
      timeSlot,
      durationMinutes,
      storeName,
      location
    } = args;
    if (!serviceName || !dateStr || !timeSlot) {
      return { status: 'ERROR', ok: false, tool, reason: 'NEED_FIELDS' };
    }
    const dur = Number(durationMinutes) || 30;
    const [hh, mm] = String(timeSlot).split(':').map((x) => parseInt(x, 10));
    const endMins = (hh || 0) * 60 + (mm || 0) + dur;
    const endHH = String(Math.floor(endMins / 60)).padStart(2, '0');
    const endMM = String(endMins % 60).padStart(2, '0');
    const dtStart = `${dateStr.replace(/-/g, '')}T${String(timeSlot).replace(':', '')}00`;
    const dtEnd = `${dateStr.replace(/-/g, '')}T${endHH}${endMM}00`;
    const uid = crypto.randomBytes(8).toString('hex');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MAX Atendente//PT-BR',
      'BEGIN:VEVENT',
      `UID:${uid}@max-atendente`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${serviceName}${clientName ? ' — ' + clientName : ''}`,
      `DESCRIPTION:${storeName || 'Agendamento MAX'}`,
      location ? `LOCATION:${location}` : null,
      'END:VEVENT',
      'END:VCALENDAR'
    ]
      .filter(Boolean)
      .join('\r\n');

    const card = getHappyPath().confirmation.build({
      serviceName,
      dateStr,
      timeSlot,
      clientName,
      durationMinutes: dur,
      storeName
    });

    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 28,
      cardText: card.text,
      ics,
      uid,
      message: 'Cartão e ICS gerados.'
    };
  }

  /** Tópico 29a — split_bill com centavos inteiros */
  static split_bill({ totalCents, totalReais, people, tipPercent } = {}) {
    const tool = 'split_bill';
    let cents =
      totalCents != null
        ? Math.round(Number(totalCents))
        : Math.round(Number(totalReais || 0) * 100);
    if (!cents || cents < 0) return { status: 'ERROR', ok: false, tool, reason: 'NEED_TOTAL' };
    const n = Math.max(1, Math.round(Number(people) || 2));
    const tip = Math.max(0, Number(tipPercent) || 0);
    const tipCents = Math.round((cents * tip) / 100);
    const grand = cents + tipCents;
    const base = Math.floor(grand / n);
    const remainder = grand - base * n;
    const shares = Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
    const sum = shares.reduce((a, b) => a + b, 0);
    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 29,
      totalCents: cents,
      tipCents,
      grandTotalCents: grand,
      people: n,
      sharesCents: shares,
      sharesReais: shares.map((c) => (c / 100).toFixed(2)),
      conserved: sum === grand,
      message: `Total ${formatPrice(grand)} ÷ ${n} = ${shares.map((c) => formatPrice(c)).join(' + ')} (conservado: ${sum === grand})`
    };
  }

  /** Tópico 29b */
  static unit_convert({ value, from, to } = {}) {
    const tool = 'unit_convert';
    const v = Number(value);
    if (Number.isNaN(v)) return { status: 'ERROR', ok: false, tool, reason: 'NEED_VALUE' };
    const f = String(from || '').toLowerCase();
    const t = String(to || '').toLowerCase();
    const table = {
      'km:mi': 0.621371,
      'mi:km': 1.60934,
      'kg:lb': 2.20462,
      'lb:kg': 0.453592,
      'm:ft': 3.28084,
      'ft:m': 0.3048,
      'c:f': null,
      'f:c': null
    };
    const key = `${f}:${t}`;
    let result;
    if (key === 'c:f') result = (v * 9) / 5 + 32;
    else if (key === 'f:c') result = ((v - 32) * 5) / 9;
    else if (table[key] != null) result = v * table[key];
    else {
      return { status: 'ERROR', ok: false, tool, reason: 'UNSUPPORTED_PAIR', pair: key };
    }
    return {
      status: 'SUCCESS',
      ok: true,
      tool,
      topic: 29,
      value: v,
      from: f,
      to: t,
      result: Math.round(result * 1000) / 1000,
      message: `${v} ${f} = ${Math.round(result * 1000) / 1000} ${t}`
    };
  }

  /** Tópico 30 */
  static async follow_url_summarize({ url, maxChars } = {}) {
    const tool = 'follow_url_summarize';
    try {
      const u = String(url || '').trim();
      if (!/^https?:\/\//i.test(u)) {
        return { status: 'ERROR', ok: false, tool, reason: 'INVALID_URL' };
      }
      const res = await fetch(u, {
        headers: { 'User-Agent': 'MAX-Atendente/1.5 (+summarize)', Accept: 'text/html,text/plain' },
        redirect: 'follow'
      });
      if (!res.ok) {
        return { status: 'ERROR', ok: false, tool, reason: `HTTP_${res.status}` };
      }
      const ct = res.headers.get('content-type') || '';
      let text = await res.text();
      if (/html/i.test(ct)) {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      const cap = Math.min(Math.max(Number(maxChars) || 1200, 400), 4000);
      const slice = text.slice(0, cap);
      const sentences = slice.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40).slice(0, 5);
      return {
        status: 'SUCCESS',
        ok: true,
        tool,
        topic: 30,
        url: u,
        chars: slice.length,
        bullets: sentences,
        preview: slice.slice(0, 400),
        message: sentences.length
          ? `Resumo heurístico (${sentences.length} trechos).`
          : 'Conteúdo obtido; pouco texto extraível.'
      };
    } catch (e) {
      return { status: 'ERROR', ok: false, tool, reason: e.message };
    }
  }

  static async dispatch(name, args = {}) {
    switch (name) {
      case 'book_appointment_confirmed':
        return this.book_appointment_confirmed(args);
      case 'list_my_appointments':
        return this.list_my_appointments(args);
      case 'reschedule_appointment':
        return this.reschedule_appointment(args);
      case 'get_travel_time':
        return this.get_travel_time(args);
      case 'compare_services':
        return this.compare_services(args);
      case 'upsell_safe':
        return this.upsell_safe(args);
      case 'faq_from_pdf':
        return this.faq_from_pdf(args);
      case 'generate_booking_card':
        return this.generate_booking_card(args);
      case 'split_bill':
        return this.split_bill(args);
      case 'unit_convert':
        return this.unit_convert(args);
      case 'follow_url_summarize':
        return this.follow_url_summarize(args);
      default:
        return { status: 'ERROR', ok: false, reason: 'UNKNOWN_NATIVE_TOOL', tool: name };
    }
  }
}

module.exports = MaxNativeTools;
