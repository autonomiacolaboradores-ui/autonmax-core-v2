'use strict';

const assert = require('assert');
const http = require('http');
const HttpServer = require('../core/ring2/HttpServer');
const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');
const path = require('path');
const fs = require('fs');

async function testEndpoints() {
  console.log('[TEST] Iniciando teste dos endpoints REST de Serviços e Produtos...');

  const dbPath = path.join(__dirname, 'workspace', `test_endpoints_${Date.now()}.json`);
  const configurator = new PmeAgentConfigurator(dbPath);
  const server = new HttpServer({
    port: 9876,
    host: '127.0.0.1',
    pmeConfigurator: configurator
  });

  await server.start();
  const baseUrl = 'http://127.0.0.1:9876';
  const pid = 'parceiro_endpoint_test';

  function req(method, pathUrl, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(baseUrl + pathUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      const r = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
          } catch (_) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      });
      r.on('error', reject);
      if (body) r.write(JSON.stringify(body));
      r.end();
    });
  }

  try {
    // 1. Listagem inicial de serviços (deve estar vazia)
    let res = await req('GET', `/api/v1/pme/${pid}/services`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.status, 'SUCCESS');
    assert.deepStrictEqual(res.data.services, []);
    console.log('✅ GET /services vazio validado');

    // 2. Criar serviço
    res = await req('POST', `/api/v1/pme/${pid}/services`, {
      name: 'Design de Sobrancelhas',
      priceCents: 4500,
      durationMinutes: 30,
      category: 'Estética',
      description: 'Design personalizado com pinça e henna.'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.service.name, 'Design de Sobrancelhas');
    assert.strictEqual(res.data.service.durationMinutes, 30);
    assert.strictEqual(res.data.service.priceCents, 4500);
    const serviceId = res.data.service.id;
    console.log('✅ POST /services criação validada');

    // 3. Atualizar serviço
    res = await req('PUT', `/api/v1/pme/${pid}/services/${serviceId}`, {
      priceCents: 5000,
      durationMinutes: 35
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.service.priceCents, 5000);
    assert.strictEqual(res.data.service.durationMinutes, 35);
    console.log('✅ PUT /services/:id atualização validada');

    // 4. Listar serviços com item cadastrado
    res = await req('GET', `/api/v1/pme/${pid}/services`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.services.length, 1);
    console.log('✅ GET /services listagem validada');

    // 5. Listagem inicial de produtos (deve estar vazia)
    res = await req('GET', `/api/v1/pme/${pid}/products`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.status, 'SUCCESS');
    assert.deepStrictEqual(res.data.products, []);
    console.log('✅ GET /products vazio validado');

    // 6. Criar produto
    res = await req('POST', `/api/v1/pme/${pid}/products`, {
      name: 'Kit Sérum Facial',
      priceCents: 8900,
      stock: 15,
      unit: 'un',
      category: 'Cosméticos',
      description: 'Sérum hidratante com ácido hialurônico.'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.product.name, 'Kit Sérum Facial');
    assert.strictEqual(res.data.product.stock, 15);
    const productId = res.data.product.id;
    console.log('✅ POST /products criação validada');

    // 7. Atualizar produto
    res = await req('PUT', `/api/v1/pme/${pid}/products/${productId}`, {
      stock: 12,
      priceCents: 9500
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.product.stock, 12);
    assert.strictEqual(res.data.product.priceCents, 9500);
    console.log('✅ PUT /products/:id atualização validada');

    // 8. Deletar serviço
    res = await req('DELETE', `/api/v1/pme/${pid}/services/${serviceId}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.services.length, 0);
    console.log('✅ DELETE /services/:id remoção validada');

    // 9. Deletar produto
    res = await req('DELETE', `/api/v1/pme/${pid}/products/${productId}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.products.length, 0);
    console.log('✅ DELETE /products/:id remoção validada');

    console.log('\n🎉 TODOS OS ENDPOINTS REST DE SERVIÇOS E PRODUTOS FUNCIONANDO PERFEITAMENTE!');
  } finally {
    await server.stop();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    process.exit(0);
  }
}

testEndpoints().catch(err => {
  console.error('❌ Falha nos endpoints:', err);
  process.exit(1);
});
