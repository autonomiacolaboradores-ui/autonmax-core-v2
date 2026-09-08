'use strict';

/**
 * BLOCK 29 — PME Agent Configurator (Sprint 10 — API Atualizada)
 *
 * SANITIZAÇÃO Sprint 10:
 * - Testes 1, 3, 4 originais (compileSystemPrompt/PixGateway/PmeAppointmentEngine) DESATIVADOS
 *   pois exigem módulos da arquitetura financeira latente (MaxCoin/Pix Split de pedidos).
 * - Teste 2 reescrito para validar a nova API do PmeAgentConfigurator (Sprint 10).
 * - Novos testes validam: getAttendantConfig, updateProfileAndPrompt, addPdfDocument,
 *   addImageDocument, removeKnowledgeFile.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');

test('🚀 BLOCK 29 — PME Sovereign Agent Configurator (Sprint 10 — Painel PME)', async (mainTest) => {

  // ── DESATIVADO: Teste 1 original (compileSystemPrompt / guardrails anti-jailbreak da API legada)
  // Razão: PmeAgentConfigurator foi reescrito na Sprint 10. compileSystemPrompt não existe mais.

  await mainTest.test('1. getAttendantConfig — Criação de Config Padrão (Sprint 10)', () => {
    const dbPath = path.join(__dirname, 'workspace', `pme_29_test_${Date.now()}.json`);
    const configurator = new PmeAgentConfigurator(dbPath);
    const config = configurator.getAttendantConfig('parceiro_test_29');

    assert.ok(config, 'Config retornada');
    assert.strictEqual(config.partnerId, 'parceiro_test_29');
    assert.ok(Array.isArray(config.pdfs), 'Campo pdfs é array');
    assert.ok(Array.isArray(config.images), 'Campo images é array');
    assert.strictEqual(config.pdfs.length, 0, 'PDFs inicializados vazios');
    assert.strictEqual(config.images.length, 0, 'Imagens inicializadas vazias');
    assert.ok(config.personalityPrompt, 'personalityPrompt padrão presente');
    
    if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch (_) {}
  });

  await mainTest.test('2. updateProfileAndPrompt — Atualiza Nome e Prompt do Max', () => {
    const dbPath = path.join(__dirname, 'workspace', `pme_29_profile_${Date.now()}.json`);
    const configurator = new PmeAgentConfigurator(dbPath);
    const partnerId = 'parceiro_profile_test';

    const updated = configurator.updateProfileAndPrompt(partnerId, {
      displayName: 'Barbearia Alpha',
      personalityPrompt: 'Você é o Max da Barbearia Alpha. Seja cordial e objetivo.',
      storeName: 'Barbearia Alpha',
      storeSegment: 'Estética Masculina'
    });

    assert.strictEqual(updated.displayName, 'Barbearia Alpha', 'displayName salvo corretamente');
    assert.strictEqual(updated.personalityPrompt, 'Você é o Max da Barbearia Alpha. Seja cordial e objetivo.', 'prompt salvo');
    assert.strictEqual(updated.storeName, 'Barbearia Alpha');
    assert.strictEqual(updated.storeSegment, 'Estética Masculina');

    // Leitura persistida
    const reLido = configurator.getAttendantConfig(partnerId);
    assert.strictEqual(reLido.displayName, 'Barbearia Alpha', 'displayName persiste após re-leitura');

    // Cleanup
    if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch (_) {}
  });

  await mainTest.test('3. addPdfDocument — Limite de 5 PDFs com Bloqueio Automático', () => {
    const dbPath = path.join(__dirname, 'workspace', `pme_29_pdf_${Date.now()}.json`);
    const configurator = new PmeAgentConfigurator(dbPath);
    const partnerId = 'parceiro_pdf_test';

    // Adicionar 5 PDFs (limite máximo)
    for (let i = 1; i <= 5; i++) {
      const result = configurator.addPdfDocument(partnerId, {
        name: `tabela_precos_${i}.pdf`,
        sizeBytes: i * 1024,
        text: `Conteúdo do documento ${i}`
      });
      assert.strictEqual(result.success, true, `PDF ${i} adicionado com sucesso`);
      assert.ok(result.file.id, 'ID gerado automaticamente');
    }

    const config5 = configurator.getAttendantConfig(partnerId);
    assert.strictEqual(config5.pdfs.length, 5, '5 PDFs cadastrados');

    // Tentar adicionar o 6º — deve ser bloqueado
    const blockedResult = configurator.addPdfDocument(partnerId, { name: 'extra.pdf', sizeBytes: 100, text: '' });
    assert.strictEqual(blockedResult.success, false, '6º PDF deve ser bloqueado');
    assert.ok(blockedResult.error.includes('Limite de 5'), `Mensagem de limite correta: ${blockedResult.error}`);

    // Cleanup
    if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch (_) {}
  });

  await mainTest.test('4. addImageDocument — Limite de 10 Imagens com Bloqueio Automático', () => {
    const dbPath = path.join(__dirname, 'workspace', `pme_29_img_${Date.now()}.json`);
    const configurator = new PmeAgentConfigurator(dbPath);
    const partnerId = 'parceiro_img_test';

    // Adicionar 10 imagens (limite máximo)
    for (let i = 1; i <= 10; i++) {
      const result = configurator.addImageDocument(partnerId, {
        name: `produto_${i}.png`,
        sizeBytes: i * 512,
        dataUrl: `data:image/png;base64,TEST_BASE64_${i}`
      });
      assert.strictEqual(result.success, true, `Imagem ${i} adicionada com sucesso`);
    }

    const config10 = configurator.getAttendantConfig(partnerId);
    assert.strictEqual(config10.images.length, 10, '10 imagens cadastradas');

    // Tentar adicionar a 11ª — deve ser bloqueada
    const blockedResult = configurator.addImageDocument(partnerId, { name: 'extra.png', sizeBytes: 100, dataUrl: '' });
    assert.strictEqual(blockedResult.success, false, '11ª imagem deve ser bloqueada');
    assert.ok(blockedResult.error.includes('Limite de 10'), `Mensagem de limite correta: ${blockedResult.error}`);

    // Cleanup
    if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch (_) {}
  });

  await mainTest.test('5. removeKnowledgeFile — Remoção Individual de PDF e Imagem', () => {
    const dbPath = path.join(__dirname, 'workspace', `pme_29_remove_${Date.now()}.json`);
    const configurator = new PmeAgentConfigurator(dbPath);
    const partnerId = 'parceiro_remove_test';

    // Adicionar 2 PDFs e 2 Imagens
    const pdf1 = configurator.addPdfDocument(partnerId, { name: 'cardapio.pdf', sizeBytes: 2048, text: 'Cardápio da loja' });
    const pdf2 = configurator.addPdfDocument(partnerId, { name: 'manual.pdf', sizeBytes: 1024, text: 'Manual interno' });
    const img1 = configurator.addImageDocument(partnerId, { name: 'foto1.jpg', sizeBytes: 5120, dataUrl: 'data:image/jpeg;base64,A' });
    const img2 = configurator.addImageDocument(partnerId, { name: 'foto2.jpg', sizeBytes: 4096, dataUrl: 'data:image/jpeg;base64,B' });

    // Remover PDF 1
    const rmPdf = configurator.removeKnowledgeFile(partnerId, pdf1.file.id, 'pdf');
    assert.strictEqual(rmPdf.success, true, 'PDF removido com sucesso');
    assert.strictEqual(rmPdf.config.pdfs.length, 1, 'Resta 1 PDF após remoção');
    assert.strictEqual(rmPdf.config.pdfs[0].name, 'manual.pdf', 'PDF correto permanece');

    // Remover Imagem 1
    const rmImg = configurator.removeKnowledgeFile(partnerId, img1.file.id, 'image');
    assert.strictEqual(rmImg.success, true, 'Imagem removida com sucesso');
    assert.strictEqual(rmImg.config.images.length, 1, 'Resta 1 imagem após remoção');

    // Tentar remover ID inexistente
    const notFound = configurator.removeKnowledgeFile(partnerId, 'id_nao_existe', 'pdf');
    assert.strictEqual(notFound.success, false, 'Remoção de ID inexistente retorna false');

    // Tentar remover tipo inválido
    const badType = configurator.removeKnowledgeFile(partnerId, pdf2.file.id, 'video');
    assert.strictEqual(badType.success, false, 'Tipo inválido retorna false');

    // Cleanup
    if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch (_) {}
  });

  // ── DESATIVADO: Teste 3 original (PmeAppointmentEngine + PixGateway — PIX Signal latente)
  // ── DESATIVADO: Teste 4 original (Fluxo PIX -> Orçamento PDF — latente)

});
