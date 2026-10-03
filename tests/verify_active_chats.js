const puppeteer = require('puppeteer');

(async () => {
    console.log('🔍 Iniciando Teste da Tela de Conversas Ativas...');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (e) {
        console.error('❌ Falha ao iniciar o Puppeteer:', e.message);
        process.exit(1);
    }

    const page = await browser.newPage();
    
    // Use request interception to mock the API response
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().includes('/api/v1/pme/') && request.url().includes('/active-chats')) {
            request.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'SUCCESS',
                    activeChats: [
                        {
                            userKey: '5511999999999@s.whatsapp.net',
                            clientName: 'João da Silva',
                            lastMessage: 'Gostaria de agendar um horário',
                            lastMessageAt: Date.now(),
                            isPaused: false,
                            humanRequested: false
                        },
                        {
                            userKey: '5511888888888@s.whatsapp.net',
                            clientName: 'Maria Oliveira',
                            lastMessage: 'Preciso falar com um atendente',
                            lastMessageAt: Date.now() - 60000,
                            isPaused: true,
                            humanRequested: true
                        }
                    ]
                })
            });
        } else {
            request.continue();
        }
    });

    console.log('🌐 Navegando para http://localhost:3000...');
    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    } catch (err) {
        console.error('❌ Falha ao acessar o localhost:3000. Tentando acessar o index.html localmente...');
        // Try file path if server is not running
        const path = require('path');
        const indexPath = 'file://' + path.resolve(__dirname, '../public/index.html');
        await page.goto(indexPath, { waitUntil: 'networkidle2' });
    }

    // Bypass welcome screen and open chats mode
    await page.evaluate(() => {
        if (window.startAppJourney) window.startAppJourney();
        const tabBtnChats = document.getElementById('tabBtnChats');
        if (tabBtnChats) tabBtnChats.click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // Force call fetchActiveChats if needed
    await page.evaluate(async () => {
        if (window.fetchActiveChats) {
            await window.fetchActiveChats();
        }
    });

    await new Promise(r => setTimeout(r, 1000));

    // Check DOM for elements
    const report = await page.evaluate(() => {
        const grid = document.getElementById('chatsGrid');
        if (!grid) return { error: 'Grid de conversas não encontrado (#chatsGrid)' };

        const cards = grid.querySelectorAll('.chat-card');
        const results = {
            totalCards: cards.length,
            elements: []
        };

        cards.forEach((card, index) => {
            const hasName = card.querySelector('.chat-name') !== null;
            const hasTime = card.querySelector('.chat-time') !== null;
            const hasMsg = card.querySelector('.chat-last-msg') !== null;
            const pauseBtn = card.querySelector('.btn-pause') || card.querySelector('.btn-resume');
            const hasPauseBtn = pauseBtn !== null;
            const hasResolveBtn = card.querySelector('.btn-resolve') !== null;
            const pauseBtnText = pauseBtn ? pauseBtn.innerText : '';

            results.elements.push({
                index: index + 1,
                hasName,
                hasTime,
                hasMsg,
                hasPauseBtn,
                pauseBtnText,
                hasResolveBtn
            });
        });

        return results;
    });

    console.log('\n====================================================');
    console.log('📊 RESULTADO DO TESTE DE RENDERIZAÇÃO');
    console.log('====================================================\n');

    if (report.error) {
        console.log('❌ ERRO:', report.error);
    } else {
        console.log(`✅ Cards renderizados: ${report.totalCards}`);
        report.elements.forEach(item => {
            console.log(`\nCard ${item.index}:`);
            console.log(`- Nome do Cliente: ${item.hasName ? '✅' : '❌'}`);
            console.log(`- Horário: ${item.hasTime ? '✅' : '❌'}`);
            console.log(`- Última Mensagem: ${item.hasMsg ? '✅' : '❌'}`);
            console.log(`- Botão Pausar/Retomar: ${item.hasPauseBtn ? '✅ (' + item.pauseBtnText + ')' : '❌'}`);
            console.log(`- Botão Resolver (apenas p/ alerta): ${item.hasResolveBtn ? '✅' : (item.index === 2 ? '❌' : 'N/A')}`);
        });
    }

    await browser.close();
    console.log('\n✓ Teste Concluído.\n');
})();
