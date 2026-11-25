'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { AppointmentRepository } = require('../core/storage/repositories/AppointmentRepository');
const { CatalogService } = require('../core/domain/CatalogService');
const { BookingService } = require('../core/domain/BookingService');
const { OrderService } = require('../core/domain/OrderService');
const { CustomerService } = require('../core/domain/CustomerService');
const { PdfService } = require('../core/domain/PdfService');
const {
  RegionalNormalizer,
  DomainError,
  parseDateStr,
  parseTimeSlot,
  formatBrazilianPhone,
} = require('../core/domain/RegionalNormalizer');

function createDomainTestContext() {
  const dbManager = new DatabaseManager({ dbPath: ':memory:' });
  dbManager.init();
  const partnerRepo = new PartnerRepository(dbManager);
  const catalogService = new CatalogService({ dbManager });
  const bookingService = new BookingService({ dbManager });
  const orderService = new OrderService({ dbManager });
  const customerService = new CustomerService({ dbManager });
  const pdfService = new PdfService();

  const partner = partnerRepo.create({
    id: 'prt-l2',
    email: 'studio@autonmax.dev',
    displayName: 'Studio Autonmax',
    workingHours: {
      days: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
      startTime: '09:00',
      endTime: '18:00',
    },
  });

  return {
    dbManager,
    partnerRepo,
    partner,
    catalogService,
    bookingService,
    orderService,
    customerService,
    pdfService,
  };
}

describe('Layer 2 — Domínio PME & Trava Atômica (Elo 1 e Elo 2)', () => {
  test('1. Desambiguação de Tipo (Elo 1): tentar agendar PRODUCT falha e não grava no banco', () => {
    const { dbManager, partner, catalogService, bookingService } =
      createDomainTestContext();

    try {
      const product = catalogService.createItem(partner.id, {
        id: 'prd-pomada',
        type: 'PRODUCT',
        name: 'Pomada Modeladora',
        priceCents: 4500,
      });

      assert.throws(
        () => {
          bookingService.bookService({
            partnerId: partner.id,
            itemId: product.id,
            dateStr: '2026-12-07', // Monday
            timeSlot: '10:00',
            clientName: 'João Silva',
            confirmed: true,
          });
        },
        (err) => {
          assert.ok(err instanceof DomainError);
          assert.equal(err.code, 'INVALID_ITEM_TYPE');
          return true;
        }
      );

      // Also verify checkAvailableSlots rejects PRODUCT
      assert.throws(
        () => {
          bookingService.checkAvailableSlots({
            partnerId: partner.id,
            itemId: product.id,
            dateStr: '2026-12-07',
          });
        },
        (err) => err instanceof DomainError && err.code === 'INVALID_ITEM_TYPE'
      );

      // Nothing persisted
      assert.equal(bookingService.listByDate(partner.id, '2026-12-07').length, 0);

      // Conversely, OrderService rejects SERVICE items
      const service = catalogService.createItem(partner.id, {
        id: 'svc-corte',
        type: 'SERVICE',
        name: 'Corte Social',
        priceCents: 5000,
        durationMinutes: 30,
      });

      const { orderService } = { orderService: new OrderService({ dbManager }) };
      assert.throws(
        () => {
          orderService.createOrder({
            partnerId: partner.id,
            items: [{ itemId: service.id, qty: 1 }],
            clientName: 'João Silva',
            confirmed: true,
          });
        },
        (err) => err instanceof DomainError && err.code === 'INVALID_ITEM_TYPE'
      );
    } finally {
      dbManager.close();
    }
  });

  test('2. Preço Autorizativo do Banco (Elo 2): OrderService ignora preço externo e calcula em centavos do SQLite', () => {
    const { dbManager, partner, catalogService, orderService } =
      createDomainTestContext();

    try {
      const p1 = catalogService.createItem(partner.id, {
        id: 'prd-shampoo',
        type: 'PRODUCT',
        name: 'Shampoo Barba',
        priceCents: 4990,
      });
      const p2 = catalogService.createItem(partner.id, {
        id: 'prd-oleo',
        type: 'PRODUCT',
        name: 'Óleo Hidratante',
        priceCents: 6500,
      });

      // Attempt to inject tampered prices and totalCents
      const res = orderService.createOrder({
        partnerId: partner.id,
        clientName: 'Marcos Lima',
        items: [
          { itemId: p1.id, qty: 2, priceCents: 1, unitPrice: 0.01, name: 'Grátis' },
          { itemId: p2.id, qty: 1, price: 1, priceCents: 100 },
        ],
        totalCents: 1,
        paymentMethod: 'PIX',
        deliveryType: 'PICKUP',
        confirmed: true,
      });

      assert.equal(res.ok, true);
      // Expected: 2 * 4990 + 1 * 6500 = 16480 cents (R$ 164,80)
      assert.equal(res.order.total_cents, 16480);
      assert.equal(res.order.items[0].name, 'Shampoo Barba');
      assert.equal(res.order.items[0].price_cents, 4990);
      assert.equal(res.order.items[0].subtotal_cents, 9980);
      assert.equal(res.order.items[1].price_cents, 6500);

      // Must require confirmed === true
      assert.throws(
        () => {
          orderService.createOrder({
            partnerId: partner.id,
            clientName: 'Marcos Lima',
            items: [{ itemId: p1.id, qty: 1 }],
            confirmed: false,
          });
        },
        (err) => err instanceof DomainError && err.code === 'CONFIRMATION_REQUIRED'
      );
    } finally {
      dbManager.close();
    }
  });

  test('3. Integridade do version_hash: atualização de nome, descrição, duração ou preço recalcula SHA-256', () => {
    const { dbManager, partner, catalogService } = createDomainTestContext();

    try {
      const item = catalogService.createItem(partner.id, {
        id: 'svc-barba',
        type: 'SERVICE',
        name: 'Barba Completa',
        description: 'Toalha quente',
        priceCents: 4000,
        durationMinutes: 30,
      });
      assert.match(item.version_hash, /^[a-f0-9]{64}$/);
      assert.equal(
        CatalogService.formatContextLine(item),
        '[svc-barba] Barba Completa — R$ 40,00 (SERVICE)'
      );

      const h0 = item.version_hash;
      const afterName = catalogService.updateItem(partner.id, item.id, {
        name: 'Barba Terapia',
      });
      assert.notEqual(afterName.version_hash, h0);

      const h1 = afterName.version_hash;
      const afterDesc = catalogService.updateItem(partner.id, item.id, {
        description: 'Toalha quente + ozônio',
      });
      assert.notEqual(afterDesc.version_hash, h1);

      const h2 = afterDesc.version_hash;
      const afterDuration = catalogService.updateItem(partner.id, item.id, {
        durationMinutes: 45,
      });
      assert.notEqual(afterDuration.version_hash, h2);

      const h3 = afterDuration.version_hash;
      const afterPrice = catalogService.updateItem(partner.id, item.id, {
        priceCents: 5500,
      });
      assert.notEqual(afterPrice.version_hash, h3);
      assert.equal(afterPrice.price_label, 'R$ 55,00');
    } finally {
      dbManager.close();
    }
  });

  test('4. Idempotência de Operação: mesma idempotencyKey retorna registro existente sem duplicar', () => {
    const { dbManager, partner, catalogService, bookingService, orderService } =
      createDomainTestContext();

    try {
      const svc = catalogService.createItem(partner.id, {
        id: 'svc-idem',
        type: 'SERVICE',
        name: 'Corte Rápido',
        priceCents: 3500,
        durationMinutes: 30,
      });
      const prd = catalogService.createItem(partner.id, {
        id: 'prd-idem',
        type: 'PRODUCT',
        name: 'Cera Matte',
        priceCents: 4200,
      });

      const b1 = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc.id,
        dateStr: '2026-12-08', // Tuesday
        timeSlot: '15:00',
        clientName: 'Rafael',
        confirmed: true,
        idempotencyKey: 'idem-book-001',
      });
      const b2 = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc.id,
        dateStr: '2026-12-08',
        timeSlot: '15:00',
        clientName: 'Rafael',
        confirmed: true,
        idempotencyKey: 'idem-book-001',
      });
      assert.equal(b1.idempotent, false);
      assert.equal(b2.idempotent, true);
      assert.equal(b2.appointment.id, b1.appointment.id);
      assert.equal(bookingService.listByDate(partner.id, '2026-12-08').length, 1);

      const o1 = orderService.createOrder({
        partnerId: partner.id,
        items: [{ itemId: prd.id, qty: 2 }],
        clientName: 'Rafael',
        confirmed: true,
        idempotencyKey: 'idem-ord-001',
      });
      const o2 = orderService.createOrder({
        partnerId: partner.id,
        items: [{ itemId: prd.id, qty: 2 }],
        clientName: 'Rafael',
        confirmed: true,
        idempotencyKey: 'idem-ord-001',
      });
      assert.equal(o1.idempotent, false);
      assert.equal(o2.idempotent, true);
      assert.equal(o2.order.id, o1.order.id);
      assert.equal(orderService.listOrders(partner.id).length, 1);
    } finally {
      dbManager.close();
    }
  });

  test('5. Bloqueio de Sobreposição por Duração: 60 min às 10:00 bloqueia 10:30 atomicamente', () => {
    const { dbManager, partner, catalogService, bookingService } =
      createDomainTestContext();

    try {
      const svc60 = catalogService.createItem(partner.id, {
        id: 'svc-60',
        type: 'SERVICE',
        name: 'Combo Corte + Barba',
        priceCents: 9000,
        durationMinutes: 60,
      });
      const svc30 = catalogService.createItem(partner.id, {
        id: 'svc-30',
        type: 'SERVICE',
        name: 'Sobrancelha',
        priceCents: 2500,
        durationMinutes: 30,
      });

      const first = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc60.id,
        dateStr: '2026-12-09', // Wednesday
        timeSlot: '10:00',
        clientName: 'Lucas',
        confirmed: true,
      });
      assert.equal(first.appointment.duration_minutes_snapshot, 60);

      // Overlap inside [10:00, 11:00) -> 10:30 MUST fail atomically
      assert.throws(
        () => {
          bookingService.bookService({
            partnerId: partner.id,
            itemId: svc30.id,
            dateStr: '2026-12-09',
            timeSlot: '10:30',
            clientName: 'Pedro',
            confirmed: true,
          });
        },
        (err) => {
          assert.ok(err instanceof DomainError);
          assert.equal(err.code, 'SLOT_TAKEN');
          assert.equal(err.statusCode, 409);
          return true;
        }
      );

      // Adjacent 11:00 succeeds cleanly (no overlap: 10:00-11:00 vs 11:00-11:30)
      const adjacent = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc30.id,
        dateStr: '2026-12-09',
        timeSlot: '11:00',
        clientName: 'Pedro',
        confirmed: true,
      });
      assert.equal(adjacent.appointment.time_slot, '11:00');

      // checkAvailableSlots excludes 10:00, 10:30, and 11:00 for a 30-min service
      const avail = bookingService.checkAvailableSlots({
        partnerId: partner.id,
        itemId: svc30.id,
        dateStr: '2026-12-09',
        skipPastCheck: true,
      });
      const freeSlots = avail.slots.map((s) => s.timeSlot);
      assert.equal(freeSlots.includes('10:00'), false);
      assert.equal(freeSlots.includes('10:30'), false);
      assert.equal(freeSlots.includes('11:00'), false);
      assert.equal(freeSlots.includes('09:30'), true);
      assert.equal(freeSlots.includes('11:30'), true);

      // Cancel frees the 10:00..11:00 window
      bookingService.cancelAppointment({
        partnerId: partner.id,
        appointmentId: first.appointment.id,
      });
      const rebooked = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc30.id,
        dateStr: '2026-12-09',
        timeSlot: '10:30',
        clientName: 'Mariana',
        confirmed: true,
      });
      assert.equal(rebooked.appointment.status, 'CONFIRMED');
    } finally {
      dbManager.close();
    }
  });

  test('6. Normalização PT-BR, CustomerService CRM e PdfService nativo sem Puppeteer', () => {
    const { dbManager, partner, catalogService, bookingService, orderService, customerService, pdfService } =
      createDomainTestContext();

    try {
      // RegionalNormalizer + PT-BR dates/times/phones
      const normalizer = new RegionalNormalizer();
      const normRes = normalizer.normalize('Uai sô, marca pra mim amanhã às 3 da tarde blz');
      assert.match(normRes.text, /quero agendar/);
      assert.match(normRes.text, /ok/);

      assert.equal(parseDateStr('depois de amanhã', '2026-12-01'), '2026-12-03');
      assert.equal(parseDateStr('15/12/2026', '2026-12-01'), '2026-12-15');
      assert.equal(parseTimeSlot('às 3 da tarde'), '15:00');
      assert.equal(parseTimeSlot('nove da manhã'), '09:00');
      assert.equal(
        formatBrazilianPhone('5511987654321@s.whatsapp.net'),
        '(11) 98765-4321'
      );

      // CustomerService
      const customer = customerService.upsertCustomer(partner.id, {
        channel: 'whatsapp',
        externalId: '5511987654321@s.whatsapp.net',
        name: 'Fernanda',
        facts: { canal_origem: 'instagram' },
      });
      assert.equal(customer.phone, '(11) 98765-4321');
      const updatedCustomer = customerService.recordInteraction(
        partner.id,
        customer.id,
        {
          factsPatch: { preferencia: 'manhã' },
          incrementVisit: true,
        }
      );
      assert.equal(updatedCustomer.visits_count, 1);
      assert.deepEqual(updatedCustomer.facts, {
        canal_origem: 'instagram',
        preferencia: 'manhã',
      });

      // PdfService native PDF 1.4 generation (buffer & temp file)
      const svc = catalogService.createItem(partner.id, {
        id: 'svc-pdf',
        type: 'SERVICE',
        name: 'Corte Feminino',
        priceCents: 12000,
        durationMinutes: 60,
      });
      const prd = catalogService.createItem(partner.id, {
        id: 'prd-pdf',
        type: 'PRODUCT',
        name: 'Máscara Capilar',
        priceCents: 8500,
      });

      const booked = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc.id,
        customerId: customer.id,
        dateStr: '2026-12-10',
        timeSlot: '09:00',
        clientName: 'Fernanda',
        confirmed: true,
      });
      const ordered = orderService.createOrder({
        partnerId: partner.id,
        customerId: customer.id,
        items: [{ itemId: prd.id, qty: 1 }],
        clientName: 'Fernanda',
        confirmed: true,
      });

      const apptPdf = pdfService.buildAppointmentsPdf({
        partnerName: partner.display_name,
        dateStr: '2026-12-10',
        appointments: [booked.appointment],
      });
      assert.ok(Buffer.isBuffer(apptPdf.buffer));
      assert.ok(apptPdf.buffer.toString('utf8').startsWith('%PDF-1.4'));
      assert.ok(apptPdf.buffer.toString('utf8').includes('%%EOF'));

      const orderPdf = pdfService.buildOrdersPdf({
        partnerName: partner.display_name,
        dateStr: '2026-12-10',
        orders: [ordered.order],
      });
      assert.ok(orderPdf.buffer.toString('utf8').startsWith('%PDF-1.4'));

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l2-pdf-'));
      try {
        const fileRes = pdfService.generatePdfReport({
          title: 'Resumo L2',
          content: 'Linha 1\nLinha 2',
          outputDir: tmpDir,
          filename: 'resumo.pdf',
        });
        assert.ok(fs.existsSync(fileRes.filePath));
        assert.ok(fileRes.sizeBytes > 100);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } finally {
      dbManager.close();
    }
  });

  test('7. Trava Física Anti-Passado (PAST_DATE_NOT_ALLOWED): rejeita data/horário passado sem gravar no SQLite', () => {
    const dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.init();
    const partnerRepo = new PartnerRepository(dbManager);
    const catalogService = new CatalogService({ dbManager });
    const appointmentRepo = new AppointmentRepository(dbManager);
    const bookingService = new BookingService({
      dbManager,
      appointmentRepository: appointmentRepo,
      partnerRepository: partnerRepo,
      nowFn: () => new Date('2026-11-24T14:30:00-03:00'),
    });

    try {
      const partner = partnerRepo.create({
        id: 'prt-l2-past',
        email: 'past@autonmax.dev',
        displayName: 'Agenda Segura',
      });
      const svc = catalogService.createItem(partner.id, {
        id: 'svc-past-test',
        type: 'SERVICE',
        name: 'Avaliação Técnica',
        priceCents: 10000,
        durationMinutes: 30,
      });

      // 1. Ano passado (ex.: 2025-11-26) -> rejeição atômica
      assert.throws(
        () =>
          bookingService.bookService({
            partnerId: partner.id,
            itemId: svc.id,
            dateStr: '2025-11-26',
            timeSlot: '10:00',
            clientName: 'Cliente Passado',
            confirmed: true,
          }),
        (err) => err instanceof DomainError && err.code === 'PAST_DATE_NOT_ALLOWED'
      );
      assert.equal(appointmentRepo.listByPartnerAndDate(partner.id, '2025-11-26').length, 0);

      // 2. Hoje em horário já decorrido (14:00 e 14:30 com relógio em 14:30) -> rejeição atômica
      assert.throws(
        () =>
          bookingService.bookService({
            partnerId: partner.id,
            itemId: svc.id,
            dateStr: '2026-11-24',
            timeSlot: '14:00',
            clientName: 'Cliente Atrasado',
            confirmed: true,
          }),
        (err) => err instanceof DomainError && err.code === 'PAST_DATE_NOT_ALLOWED'
      );
      assert.equal(appointmentRepo.listByPartnerAndDate(partner.id, '2026-11-24').length, 0);

      // 3. checkAvailableSlots em data passada retorna vazio + pastDate: true
      const pastSlots = bookingService.checkAvailableSlots({
        partnerId: partner.id,
        itemId: svc.id,
        dateStr: '2025-11-26',
      });
      assert.equal(pastSlots.pastDate, true);
      assert.equal(pastSlots.reason, 'PAST_DATE_NOT_ALLOWED');
      assert.deepEqual(pastSlots.slots, []);

      // 4. Hoje futuro (15:00) e amanhã (2026-11-25) funcionam normalmente
      const okToday = bookingService.bookService({
        partnerId: partner.id,
        itemId: svc.id,
        dateStr: '2026-11-24',
        timeSlot: '15:00',
        clientName: 'Cliente Hoje',
        confirmed: true,
      });
      assert.equal(okToday.appointment.status, 'CONFIRMED');
    } finally {
      dbManager.close();
    }
  });
});
