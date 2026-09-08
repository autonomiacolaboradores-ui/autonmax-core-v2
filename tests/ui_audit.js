const puppeteer = require('puppeteer');

(async () => {
    console.log('🔍 Iniciando Auditoria de UI do AUTON.MAX...');
    console.log('----------------------------------------------------');

    const report = {
        consoleErrors: [],
        httpErrors: [],
        cssOverlaps: [],
        buttonHandlers: []
    };

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new', // ou true para versões antigas
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (e) {
        console.error('❌ Falha ao iniciar o Puppeteer. Instale executando: npm install puppeteer --no-save');
        console.error(e.message);
        process.exit(1);
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 1. Capturar erros de console
    page.on('console', msg => {
        if (msg.type() === 'error') {
            report.consoleErrors.push(msg.text());
        }
    });

    // 2. Capturar erros HTTP (4xx e 5xx)
    page.on('response', response => {
        const status = response.status();
        if (status >= 400) {
            report.httpErrors.push(`${status} ${response.url()}`);
        }
    });

    console.log('🌐 Navegando para http://localhost:3000...');
    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    } catch (err) {
        console.error('❌ Falha ao acessar o localhost:3000. Certifique-se que a porta 3000 está rodando (npm start).');
        await browser.close();
        process.exit(1);
    }

    // Aguarda montagem dinâmica
    await new Promise(r => setTimeout(r, 2000));

    // 3. Mapear Z-Index e Display para detectar sobreposições
    console.log('🎨 Analisando estilos, z-index e possíveis sobreposições...');
    const elementsState = await page.evaluate(() => {
        const issues = [];
        const targetSelectors = [
            '#welcomeScreen', '.welcome-screen', '.welcome-overlay',
            '#splashVideoOverlay', '#subscriptionLockModal', '#mainApp', '#googleLockscreen'
        ];

        targetSelectors.forEach(selector => {
            const els = document.querySelectorAll(selector);
            els.forEach((el, index) => {
                const style = window.getComputedStyle(el);
                issues.push({
                    selector: `${selector} (${index})`,
                    display: style.display,
                    zIndex: style.zIndex,
                    visibility: style.visibility,
                    opacity: style.opacity
                });
            });
        });
        return issues;
    });
    report.cssOverlaps = elementsState;

    // 4. Mapear botões e simular clicks
    console.log('🖱️ Simulando fluxo de navegação e validando interações...');
    const buttonsToTest = ['#btnStartApp', '#btnAuthBusiness'];

    for (const btnSelector of buttonsToTest) {
        const btnExists = await page.$(btnSelector);
        if (btnExists) {
            try {
                // Validar se o botão é clicável (não está coberto)
                const isIntersecting = await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    const rect = el.getBoundingClientRect();
                    return (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        window.getComputedStyle(el).pointerEvents !== 'none'
                    );
                }, btnSelector);

                if (!isIntersecting) {
                    report.buttonHandlers.push({
                        button: btnSelector,
                        status: '⚠️ Visível no DOM, mas inatingível na view. Forçando clique via JS.'
                    });
                } else {
                    report.buttonHandlers.push({
                        button: btnSelector,
                        status: 'Clicado com sucesso'
                    });
                }

                // Invoca diretamente o clique via JS para burlar eventuais overlays residuais
                await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (el) el.click();
                }, btnSelector);
                // Aguarda transições
                await new Promise(r => setTimeout(r, 1000));
                
                const mainAppState = await page.evaluate(() => {
                    const main = document.getElementById('mainApp');
                    if (!main) return 'NÃO ENCONTRADO DOM';
                    const style = window.getComputedStyle(main);
                    return `display: ${style.display} | opacity: ${style.opacity} | visibility: ${style.visibility}`;
                });
                
                // Anexa o resultado da view ao registro inserido acima
                report.buttonHandlers[report.buttonHandlers.length - 1].mainAppStateAfterClick = mainAppState;
                
                // Reset da página para testar próximo evento adequadamente
                await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
                await new Promise(r => setTimeout(r, 1500));
                
            } catch (err) {
                report.buttonHandlers.push({
                    button: btnSelector,
                    status: `❌ Erro ao clicar: ${err.message}`
                });
            }
        } else {
            report.buttonHandlers.push({
                button: btnSelector,
                status: '❔ Botão não encontrado no DOM.'
            });
        }
    }

    await browser.close();

    // 5. Exibir Relatório Unificado
    console.log('\n====================================================');
    console.log('📊 RELATÓRIO UNIFICADO DE DIAGNÓSTICO DE UI');
    console.log('====================================================\n');

    console.log('🔴 ERROS DE CONSOLE JS:');
    if (report.consoleErrors.length > 0) {
        report.consoleErrors.forEach(err => console.log(`   - ${err}`));
    } else {
        console.log('   ✅ Nenhum erro de console JS disparado.');
    }

    console.log('\n🔴 ERROS DE REQUISIÇÃO HTTP (4xx / 5xx):');
    if (report.httpErrors.length > 0) {
        report.httpErrors.forEach(err => console.log(`   - ${err}`));
    } else {
        console.log('   ✅ Nenhuma falha de requisição detectada (Rede limpa).');
    }

    console.log('\n🎨 ANÁLISE DE CAMADAS (CSS / Z-INDEX):');
    if (report.cssOverlaps.length > 0) {
        report.cssOverlaps.forEach(item => {
            const isVisible = item.display !== 'none' && item.opacity !== '0' && item.visibility !== 'hidden';
            let alert = '';
            
            if (isVisible && item.selector.includes('welcomeScreen')) {
                alert = ' ⚠️ (Alerta: Tela de Bloqueio ativa)';
            }
            if (isVisible && !item.selector.includes('mainApp') && parseInt(item.zIndex || '0') > 10) {
                alert += ' ⚠️ (Alerta: Elemento sobrepondo a visão geral)';
            }

            console.log(`   [${item.selector}]`);
            console.log(`      display: ${item.display} | z-index: ${item.zIndex} | visibility: ${item.visibility} ${alert}`);
        });
    } else {
        console.log('   Nenhum dos elementos cruciais rastreados foi encontrado.');
    }

    console.log('\n🖱️ TESTE DE INTERATIVIDADE DOS BOTÕES:');
    if (report.buttonHandlers.length > 0) {
        report.buttonHandlers.forEach(item => {
            console.log(`   Botão [${item.button}]: ${item.status}`);
            if (item.mainAppStateAfterClick) {
                const isValid = item.mainAppStateAfterClick.includes('display: flex') ? '✅' : '❌';
                console.log(`      -> Resultado em #mainApp: ${item.mainAppStateAfterClick} ${isValid}`);
            }
        });
    } else {
        console.log('   Nenhum botão válido foi testado.');
    }
    console.log('\n====================================================');
    console.log('✓ Concluído.\n');
})();
