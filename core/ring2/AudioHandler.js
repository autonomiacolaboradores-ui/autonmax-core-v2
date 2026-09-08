'use strict';

/**
 * AudioHandler — STT (Groq Whisper → Gemini multimodal)
 * Em falha total: NÃO joga erro seco para o cliente.
 * Retorna { ok:false, fallbackMessage } pedindo texto digitado.
 */

const FALLBACK_PT =
  'Desculpe, não consegui entender o áudio agora. Pode digitar sua mensagem em texto, por favor? Assim eu te atendo rapidinho 😊';

class AudioHandler {
  /**
   * @returns {Promise<{ ok: boolean, text?: string, provider?: string, fallbackMessage?: string, error?: string }>}
   */
  static async transcribe(buffer, mimeType = 'audio/webm') {
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const errors = [];

    if (groqKey) {
      try {
        console.log('🎙️ [AUDIO_HANDLER] Transcrevendo áudio via Groq Whisper...');
        const ext = (mimeType || '').includes('ogg')
          ? 'ogg'
          : (mimeType || '').includes('mp4') || (mimeType || '').includes('m4a')
            ? 'm4a'
            : 'webm';
        
        // Em Node.js nativo (v20+), File é a forma mais robusta de garantir que o 'filename' e 'type' sejam respeitados no FormData
        const file = new File([buffer], `audio.${ext}`, { type: mimeType || 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-large-v3'); // fallback seguro para o modelo padrão da Groq
        formData.append('language', 'pt');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}` },
          body: formData
        });

        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`Groq HTTP ${res.status}: ${errData.slice(0, 200)}`);
        }

        const data = await res.json();
        const text = String(data.text || '').trim();
        if (text) {
          return { ok: true, text, provider: 'groq-whisper' };
        }
        errors.push('Groq retornou texto vazio');
      } catch (err) {
        console.warn(`[AUDIO_HANDLER] Falha no Whisper Groq: ${err.message}. Tentando fallback...`);
        errors.push(err.message);
      }
    } else {
      errors.push('GROQ_API_KEY ausente');
    }

    if (geminiKey) {
      try {
        console.log('🎙️ [AUDIO_HANDLER] Transcrevendo áudio via Gemini Multimodal...');
        const payload = {
          contents: [
            {
              parts: [
                {
                  text: 'Transcreva este áudio de voz com precisão em português. Retorne apenas o texto transcrito, sem aspas e sem comentários.'
                },
                {
                  inlineData: {
                    mimeType: mimeType || 'audio/ogg',
                    data: Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64')
                  }
                }
              ]
            }
          ]
        };
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        const data = await res.json();
        const outText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const text = String(outText || '').trim();
        if (text) {
          return { ok: true, text, provider: 'gemini-multimodal' };
        }
        errors.push('Gemini retornou texto vazio');
      } catch (err) {
        console.warn(`[AUDIO_HANDLER] Falha no Gemini Multimodal: ${err.message}`);
        errors.push(err.message);
      }
    } else {
      errors.push('GEMINI_API_KEY ausente');
    }

    console.warn('[AUDIO_HANDLER] STT falhou em todos os provedores:', errors.join(' | '));
    return {
      ok: false,
      text: null,
      fallbackMessage: FALLBACK_PT,
      error: errors.join(' | ') || 'STT_FAILED'
    };
  }

  static getFallbackMessage() {
    return FALLBACK_PT;
  }
}

module.exports = AudioHandler;
module.exports.FALLBACK_PT = FALLBACK_PT;
