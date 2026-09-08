const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'workspace', 'autonmax.db');
const jsonPath = path.join(__dirname, '..', 'workspace', 'attendants_db.json');

console.log('--- INICIANDO EXPURGO DE DADOS FANTASMAS ---');

// 1. Limpeza no SQLite (autonmax.db)
if (fs.existsSync(dbPath)) {
    try {
        const db = new DatabaseSync(dbPath);
        console.log('[SQLite] Conectado ao autonmax.db');
        
        // Corrigir Schema (Adicionar colunas se faltarem)
        const columnsToAdd = [
            "ALTER TABLE user_accounts ADD COLUMN digital_attendant_welcome_msg TEXT DEFAULT 'Olá! Sou o Atendente Digital. Como posso te ajudar hoje?'",
            "ALTER TABLE user_accounts ADD COLUMN digital_attendant_images TEXT DEFAULT '[]'"
        ];
        for (const col of columnsToAdd) {
            try { db.exec(col); } catch (e) { /* Coluna já existe */ }
        }

        // Limpar na tabela user_accounts
        try {
            const res1 = db.prepare(`
                UPDATE user_accounts 
                SET picture = NULL 
                WHERE picture LIKE '%intro-autonomia.mp4%' OR picture LIKE '%assets/video%'
            `).run();
            console.log(`[SQLite] Registros limpos (Picture): ${res1.changes}`);
        } catch (e) { console.error('Erro em Picture:', e.message); }
        
        try {
            const res2 = db.prepare(`
                UPDATE user_accounts 
                SET digital_attendant_images = '[]' 
                WHERE digital_attendant_images LIKE '%intro-autonomia.mp4%' OR digital_attendant_images LIKE '%assets/video%'
            `).run();
            console.log(`[SQLite] Registros limpos (Images): ${res2.changes}`);
        } catch (e) { console.error('Erro em Images:', e.message); }
        
        try {
            const res3 = db.prepare(`
                UPDATE user_accounts 
                SET digital_attendant_welcome_msg = NULL 
                WHERE digital_attendant_welcome_msg LIKE '%intro-autonomia.mp4%'
            `).run();
            console.log(`[SQLite] Registros limpos (WelcomeMsg): ${res3.changes}`);
        } catch (e) { console.error('Erro em WelcomeMsg:', e.message); }

        db.close();
    } catch (e) {
        console.error('[SQLite] Erro fatal no SQLite:', e.message);
    }
} else {
    console.log('[SQLite] Arquivo autonmax.db não encontrado.');
}

// 2. Limpeza no JSON (attendants_db.json)
if (fs.existsSync(jsonPath)) {
    try {
        let rawJson = fs.readFileSync(jsonPath, 'utf8');
        let modifications = 0;
        
        let attendants = JSON.parse(rawJson);
        for (const [id, config] of Object.entries(attendants)) {
            let modified = false;
            
            // Limpar url em images
            if (Array.isArray(config.images)) {
                for (const img of config.images) {
                    if ((img.url && img.url.includes('intro-autonomia.mp4')) || 
                        (img.dataUrl && img.dataUrl.includes('intro-autonomia.mp4'))) {
                        img.url = '';
                        img.dataUrl = '';
                        modified = true;
                    }
                }
            }
            
            // Limpar em attachedFiles
            if (Array.isArray(config.attachedFiles)) {
                for (const file of config.attachedFiles) {
                    if (file.url && file.url.includes('intro-autonomia.mp4')) {
                        file.url = '';
                        modified = true;
                    }
                }
            }
            
            if (modified) {
                console.log(`[JSON] Limpando referências no usuário: ${id}`);
                modifications++;
            }
        }
        
        if (modifications > 0) {
            fs.writeFileSync(jsonPath, JSON.stringify(attendants, null, 2), 'utf8');
            console.log(`[JSON] Atualizado! ${modifications} perfis corrigidos.`);
        } else {
            console.log('[JSON] Nenhuma referência encontrada no attendants_db.json.');
        }
        
    } catch (e) {
        console.error('[JSON] Erro ao limpar JSON:', e.message);
    }
} else {
    console.log('[JSON] Arquivo attendants_db.json não encontrado.');
}

console.log('--- EXPURGO CONCLUÍDO ---');
