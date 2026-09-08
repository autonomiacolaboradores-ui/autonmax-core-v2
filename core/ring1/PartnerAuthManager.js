'use strict';

// core/ring1/PartnerAuthManager.js
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'autonmax_ring0_sovereign_secret_2026';

class PartnerAuthManager {
  constructor(runtimeCore) {
    this.runtime = runtimeCore;
  }

  // Gera JWT artesanal usando Node crypto (Sprint 8)
  _generateJWT(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    // Expiração ajustada para 30 dias
    const b64Payload = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + (30 * 24 * 60 * 60 * 1000) })).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${b64Payload}`).digest('base64url');
    return `${header}.${b64Payload}.${signature}`;
  }

  _verifyJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
      if (signature !== parts[2]) return null;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (payload.exp < Date.now()) return null;
      return payload;
    } catch (_) {
      return null;
    }
  }

  // Decodifica idToken do Google (Sprint 8)
  _decodeGoogleToken(idToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };
    } catch (_) {
      return null;
    }
  }

  async authenticateGoogleUser(authData) {
    let googleId, email, name, picture;
    let finalIdToken = authData.idToken;

    if (authData.code) {
        // Exchanging code for tokens
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: authData.code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: 'postmessage',
                grant_type: 'authorization_code'
            })
        });
        const tokenData = await res.json();
        if (tokenData.error) throw new Error('Falha ao trocar código no Google: ' + tokenData.error_description);
        finalIdToken = tokenData.id_token;
        authData.accessToken = tokenData.access_token;
        authData.refreshToken = tokenData.refresh_token;
        authData.expiresIn = tokenData.expires_in;
    }

    if (!finalIdToken) throw new Error('Token Google inválido (ausente).');

    // Validação real usando tokeninfo (Garantia de segurança da SPRINT MVP-02)
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${finalIdToken}`);
    const decoded = await verifyRes.json();
    
    if (verifyRes.status !== 200 || decoded.error) {
        throw new Error('Token Google inválido (assinatura rejeitada).');
    }
    if (decoded.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new Error('Token Google inválido (audience incorreto).');
    }

    googleId = decoded.sub;
    email = decoded.email;
    name = decoded.name || 'Usuário Google';
    picture = decoded.picture || 'assets/img/logo-autonmax.jpg';

    if (!googleId || !email) {
        throw new Error('Identidade Google incompleta.');
    }

    return await this.runtime.transaction(async (db) => {
      // Upsert Atômico no Banco
      let user = await db.get(`SELECT * FROM user_accounts WHERE google_id = ? OR email = ?`, [googleId, email]);

      if (!user) {
        const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
        await db.run(
          `INSERT INTO user_accounts (id, google_id, email, name, picture, is_partner) VALUES (?, ?, ?, ?, ?, 0)`,
          [userId, googleId, email, name, picture]
        );
        user = { id: userId, google_id: googleId, email: email, name: name, picture: picture, is_partner: 0 };
      }

      if (authData.accessToken) {
        const expiresInSec = Number(authData.expiresIn) || 3600;
        const expiresAtMs = Date.now() + (expiresInSec - 60) * 1000;
        if (authData.refreshToken) {
          await db.run(
            `UPDATE user_accounts SET google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ? WHERE id = ?`,
            [authData.accessToken, authData.refreshToken, expiresAtMs, user.id]
          );
        } else {
          await db.run(
            `UPDATE user_accounts SET google_access_token = ?, google_token_expires_at = ? WHERE id = ?`,
            [authData.accessToken, expiresAtMs, user.id]
          );
        }
      }

      // Emissão de JWT AUTON.MAX
      const token = this._generateJWT({ id: user.id, email: user.email, is_partner: user.is_partner });
      // Nova expiração para a sessão (30 dias)
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
        [token, user.id, expiresAt]
      );

      return { status: 'SUCCESS', success: true, token, user };
    });
  }

  // --- AUTENTICADOR NATIVO (Desvio Provisório) ---
  async registerNativeUser(email, password, name) {
    if (!email || !password) throw new Error("Email e senha são obrigatórios");
    email = email.trim().toLowerCase();
    if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres");
    
    const salt = crypto.randomBytes(16).toString('hex');
    const hashBuffer = crypto.scryptSync(password, salt, 64);
    const passwordHash = `${salt}:${hashBuffer.toString('hex')}`;
    
    return await this.runtime.transaction(async (db) => {
      let user = await db.get(`SELECT id FROM user_accounts WHERE email = ?`, [email]);
      if (user) throw new Error("E-mail já cadastrado");

      const userId = `usr_nat_${crypto.randomBytes(8).toString('hex')}`;
      
      await db.run(
        `INSERT INTO user_accounts (id, email, name, password_hash, is_partner) VALUES (?, ?, ?, ?, 1)`,
        [userId, email, name || 'Usuário', passwordHash]
      );
      
      user = { id: userId, email, is_partner: 1 };
      const token = this._generateJWT({ id: user.id, email: user.email, is_partner: user.is_partner });
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
        [token, user.id, expiresAt]
      );

      return { status: 'SUCCESS', success: true, token, user };
    });
  }

  async authenticateNativeUser(email, password) {
    if (!email || !password) throw new Error("Email e senha são obrigatórios");
    email = email.trim().toLowerCase();

    return await this.runtime.transaction(async (db) => {
      const user = await db.get(`SELECT * FROM user_accounts WHERE email = ?`, [email]);
      if (!user || !user.password_hash) throw new Error("Credenciais inválidas");

      const [salt, key] = user.password_hash.split(':');
      const hashBuffer = crypto.scryptSync(password, salt, 64);
      const keyBuffer = Buffer.from(key, 'hex');
      
      const match = crypto.timingSafeEqual(hashBuffer, keyBuffer);
      if (!match) throw new Error("Credenciais inválidas");

      const token = this._generateJWT({ id: user.id, email: user.email, is_partner: user.is_partner });
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
        [token, user.id, expiresAt]
      );

      return { status: 'SUCCESS', success: true, token, user };
    });
  }

  async getGoogleCredentials(userId) {
    try {
      const row = await this.runtime.dbGet(
        `SELECT google_access_token, google_refresh_token, google_token_expires_at FROM user_accounts WHERE id = ?`,
        [userId]
      );
      if (row && (row.google_access_token || row.google_refresh_token)) {
        return {
          access_token: row.google_access_token,
          refresh_token: row.google_refresh_token,
          expires_at: row.google_token_expires_at ? Number(row.google_token_expires_at) : null
        };
      }
    } catch (e) {
      console.error('[AUTH_MANAGER] Erro ao buscar credenciais do Google:', e);
    }
    return null;
  }

  async resolvePartnerGoogleToken(userId, forceRefresh = false) {
    if (!userId) {
      return { hasToken: false, token: null, source: 'none', reason: 'NOT_CONNECTED' };
    }
    if (!this._refreshLocks) this._refreshLocks = new Map();
    if (this._refreshLocks.has(userId)) {
      // Já existe uma resolução/refresh em andamento para esse usuário — aguarda o mesmo resultado
      return this._refreshLocks.get(userId);
    }
    const promise = this._doResolvePartnerGoogleToken(userId, forceRefresh);
    this._refreshLocks.set(userId, promise);
    try {
      return await promise;
    } finally {
      this._refreshLocks.delete(userId);
    }
  }

  async _doResolvePartnerGoogleToken(userId, forceRefresh) {
    const creds = await this.getGoogleCredentials(userId);
    if (!creds || (!creds.access_token && !creds.refresh_token)) {
      return { hasToken: false, token: null, source: 'none', reason: 'NOT_CONNECTED' };
    }
    const now = Date.now();
    if (!forceRefresh && creds.access_token && (!creds.expires_at || now < (creds.expires_at - 60000))) {
      return { hasToken: true, token: creds.access_token, source: 'store', reason: 'VALID' };
    }
    if (!creds.refresh_token) {
      if (!forceRefresh && creds.access_token) {
        return { hasToken: true, token: creds.access_token, source: 'store', reason: 'VALID' };
      }
      return { hasToken: false, token: null, source: 'none', reason: 'EXPIRED' };
    }

    console.log(`[CALENDAR] refresh_start partner=${userId}`);
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        console.warn(`[CALENDAR] refresh_failed partner=${userId} status=CONFIG_MISSING body=GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing`);
        return { hasToken: Boolean(creds.access_token), token: creds.access_token || null, source: creds.access_token ? 'store' : 'none', reason: 'CONFIG_MISSING' };
      }
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: creds.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const tokenData = await res.json();
      if (!res.ok || tokenData.error) {
        console.warn(`[CALENDAR] refresh_failed partner=${userId} status=${res.status} body=${JSON.stringify(tokenData)}`);
        if (tokenData.error === 'invalid_grant') {
          try {
            await this.runtime.dbRun(
              `UPDATE user_accounts SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL WHERE id = ?`,
              [userId]
            );
            console.warn(`[CALENDAR] refresh_invalid_grant partner=${userId} tokens_cleared=true`);
          } catch (clearErr) {
            console.error(`[CALENDAR] refresh_invalid_grant_clear_failed partner=${userId} err=${clearErr.message}`);
          }
        }
        return { hasToken: false, token: null, source: 'none', reason: 'REFRESH_FAIL' };
      }
      const newAccessToken = tokenData.access_token;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = now + (expiresIn - 60) * 1000;
      const newRefreshToken = tokenData.refresh_token || creds.refresh_token;
      await this.runtime.dbRun(
        `UPDATE user_accounts SET google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ? WHERE id = ?`,
        [newAccessToken, newRefreshToken, expiresAt, userId]
      );
      console.log(`[CALENDAR] refresh_ok partner=${userId} expires_at=${new Date(expiresAt).toISOString()}`);
      return { hasToken: true, token: newAccessToken, source: 'refresh', reason: 'REFRESH_OK' };
    } catch (err) {
      console.warn(`[CALENDAR] refresh_failed partner=${userId} status=EXCEPTION body=${err.message}`);
      return { hasToken: false, token: null, source: 'none', reason: 'REFRESH_FAIL' };
    }
  }

  async ensureValidGoogleAccessToken(userId, forceRefresh = false) {
    const res = await this.resolvePartnerGoogleToken(userId, forceRefresh);
    return res.token;
  }

  async upgradeToPartner(userId, storeName, segment) {
    return await this.runtime.transaction(async (db) => {
      await db.run(
        `UPDATE user_accounts SET is_partner = 1, store_name = ?, store_segment = ? WHERE id = ?`,
        [storeName, segment || 'FOOD_GASTRONOMY', userId]
      );

      const partnerId = userId; // partnerId === userId (sem tabela partner_accounts)

      // Semeia config inicial do atendente em pme_configs_v2 (tabela canônica do PME)
      const welcomeMsg = `Olá! Bem-vindo à ${storeName}. Como posso ajudar?`;
      await db.run(
        `INSERT OR REPLACE INTO pme_configs_v2 (partner_id, prompt_instructions, business_rules, updated_at)
         VALUES (?, ?, '{}', CURRENT_TIMESTAMP)`,
        [partnerId, welcomeMsg]
      );

      return { status: 'SUCCESS', partnerId, storeName, segment };
    });
  }
  async updateUserPicture(userId, base64Data) {
    if (!userId || !base64Data) return false;
    try {
      await this.runtime.dbRun(`UPDATE user_accounts SET picture = ? WHERE id = ?`, [base64Data, userId]);
      return true;
    } catch (err) {
      console.error('[AUTH_MANAGER] Erro ao atualizar picture:', err);
      return false;
    }
  }

  async updatePartnerStoreName(userId, storeName) {
    if (!userId || !storeName) return false;
    try {
      await this.runtime.dbRun(`UPDATE user_accounts SET store_name = ? WHERE id = ?`, [storeName, userId]);
      return true;
    } catch (err) {
      console.error('[AUTH_MANAGER] Erro ao atualizar store_name:', err);
      return false;
    }
  }

  createGoogleOAuthState(partnerId) {
    const payload = { partnerId, ts: Date.now(), nonce: crypto.randomBytes(8).toString('hex') };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  }

  verifyGoogleOAuthState(stateStr) {
    try {
      if (!stateStr || typeof stateStr !== 'string') return null;
      const [b64, sig] = stateStr.split('.');
      if (!b64 || !sig) return null;
      const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(b64).digest('base64url');
      if (sig !== expectedSig) return null;
      const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
      if (!payload.partnerId || !payload.ts) return null;
      // Expira state após 15 minutos
      if (Date.now() - payload.ts > 15 * 60 * 1000) return null;
      return payload.partnerId;
    } catch (_) {
      return null;
    }
  }

  async saveGoogleOAuthTokens(partnerId, tokenData, email = null) {
    if (!partnerId || !tokenData) return false;
    const now = Date.now();
    const expiresIn = Number(tokenData.expires_in) || 3600;
    const expiresAt = now + (expiresIn - 60) * 1000;
    const accessToken = tokenData.access_token || null;
    const refreshToken = tokenData.refresh_token || null;

    return await this.runtime.transaction(async (db) => {
      let user = await db.get(`SELECT id, email, google_refresh_token FROM user_accounts WHERE id = ?`, [partnerId]);
      if (!user) {
        await db.run(
          `INSERT INTO user_accounts (id, email, name, is_partner, google_access_token, google_refresh_token, google_token_expires_at)
           VALUES (?, ?, 'Parceiro PME', 1, ?, ?, ?)`,
          [partnerId, email || `${partnerId}@autonmax.pme`, accessToken, refreshToken, expiresAt]
        );
      } else {
        const finalRefreshToken = refreshToken || user.google_refresh_token;
        const finalEmail = email || user.email;
        await db.run(
          `UPDATE user_accounts SET google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ?, email = ? WHERE id = ?`,
          [accessToken, finalRefreshToken, expiresAt, finalEmail, partnerId]
        );
      }
      return true;
    });
  }

  async disconnectGoogleCalendar(partnerId) {
    if (!partnerId) return false;
    try {
      await this.runtime.dbRun(
        `UPDATE user_accounts SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL WHERE id = ?`,
        [partnerId]
      );
      return true;
    } catch (e) {
      console.error(`[AUTH_MANAGER] Erro ao desconectar Google Calendar do parceiro ${partnerId}:`, e.message);
      return false;
    }
  }

  async validateSession(token) {
    if (!token) return null;
    
    // Valida assinatura do JWT primeiro (Sprint 8)
    const payload = this._verifyJWT(token);
    if (!payload) {
        // Se a assinatura falhou ou expirou, purga do banco se existir
        await this.runtime.dbRun(`DELETE FROM user_sessions WHERE token = ?`, [token]);
        return null;
    }

    const session = await this.runtime.dbGet(
      `SELECT s.user_id, s.expires_at, u.email, u.name, u.picture, u.is_partner, u.id as partner_id, u.store_name, u.store_segment as segment 
       FROM user_sessions s 
       JOIN user_accounts u ON s.user_id = u.id 
       WHERE s.token = ?`,
      [token]
    );

    if (!session || session.expires_at < Date.now()) {
      if (session) await this.runtime.dbRun(`DELETE FROM user_sessions WHERE token = ?`, [token]);
      return null;
    }

    return session;
  }
}

module.exports = { PartnerAuthManager, JWT_SECRET };
