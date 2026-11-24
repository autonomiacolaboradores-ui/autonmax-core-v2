'use strict';

const { VoiceAdapter, FALLBACK_STT_MESSAGE } = require('./VoiceAdapter');

const DEFAULT_VOICE_TIMEOUT_MS = 15_000;

/**
 * Cloud VoiceAdapter (Render 512MB RAM compliant):
 * - STT: Groq Whisper -> Google Gemini Multimodal fallback
 * - TTS: Disabled when `VOICE_TTS_DRIVER=off` (default on constrained containers)
 *   or lightweight cloud HTTP endpoint when configured.
 */
class CloudVoiceAdapter extends VoiceAdapter {
  /**
   * @param {{
   *   groqApiKey?: string,
   *   geminiApiKey?: string,
   *   ttsDriver?: string,
   *   ttsEndpoint?: string,
   *   timeoutMs?: number,
   *   fetchImpl?: typeof fetch
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.groqApiKey = options.groqApiKey ?? process.env.GROQ_API_KEY ?? null;
    this.geminiApiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY ?? null;
    this.ttsDriver = String(
      options.ttsDriver ?? process.env.VOICE_TTS_DRIVER ?? 'off'
    ).toLowerCase();
    this.ttsEndpoint = options.ttsEndpoint ?? process.env.CLOUD_TTS_ENDPOINT ?? null;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : DEFAULT_VOICE_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  /**
   * Executes fetch bounded by AbortController timeout.
   * @private
   */
  async _fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('VOICE_TIMEOUT'));
    }, this.timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Transcribes audio via Groq Whisper with Gemini Multimodal fallback.
   * Never throws raw crashes to callers — returns friendly `fallbackMessage`.
   * @param {Buffer} buffer
   * @param {string} [mimeType='audio/ogg']
   */
  async transcribe(buffer, mimeType = 'audio/ogg') {
    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        text: '',
        provider: 'none',
        fallbackMessage: FALLBACK_STT_MESSAGE,
        error: 'EMPTY_AUDIO_BUFFER',
      };
    }

    const errors = [];

    if (this.groqApiKey && typeof this.fetchImpl === 'function') {
      try {
        const ext = String(mimeType).includes('ogg')
          ? 'ogg'
          : String(mimeType).includes('mp4') || String(mimeType).includes('m4a')
            ? 'm4a'
            : 'webm';
        const file = new File([buffer], `audio.${ext}`, {
          type: mimeType || 'audio/ogg',
        });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'pt');

        const res = await this._fetchWithTimeout(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.groqApiKey}` },
            body: formData,
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }

        const data = await res.json();
        const text = String(data?.text || '').trim();
        if (text) {
          return { ok: true, text, provider: 'groq-whisper' };
        }
        errors.push('Groq returned empty text');
      } catch (err) {
        errors.push(err?.message || 'Groq STT failed');
      }
    } else {
      errors.push('GROQ_API_KEY missing');
    }

    if (this.geminiApiKey && typeof this.fetchImpl === 'function') {
      try {
        const payload = {
          contents: [
            {
              parts: [
                {
                  text: 'Transcreva este áudio de voz com precisão em português. Retorne apenas o texto transcrito, sem aspas e sem comentários.',
                },
                {
                  inlineData: {
                    mimeType: mimeType || 'audio/ogg',
                    data: Buffer.isBuffer(buffer)
                      ? buffer.toString('base64')
                      : Buffer.from(buffer).toString('base64'),
                  },
                },
              ],
            },
          ],
        };

        const res = await this._fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }

        const data = await res.json();
        const text = String(
          data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        ).trim();
        if (text) {
          return { ok: true, text, provider: 'gemini-multimodal' };
        }
        errors.push('Gemini returned empty text');
      } catch (err) {
        errors.push(err?.message || 'Gemini STT failed');
      }
    } else {
      errors.push('GEMINI_API_KEY missing');
    }

    return {
      ok: false,
      text: '',
      provider: 'none',
      fallbackMessage: FALLBACK_STT_MESSAGE,
      error: errors.join(' | ') || 'STT_FAILED',
    };
  }

  /**
   * Synthesizes speech in cloud mode. Returns disabled state when `VOICE_TTS_DRIVER=off`.
   * @param {string} text
   * @param {{ voiceId?: string, speed?: number }} [options]
   */
  async synthesize(text, options = {}) {
    if (this.ttsDriver === 'off') {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: 'TTS_DISABLED',
      };
    }

    if (!this.ttsEndpoint || typeof this.fetchImpl !== 'function') {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: 'CLOUD_TTS_NOT_CONFIGURED',
      };
    }

    try {
      const res = await this._fetchWithTimeout(this.ttsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: String(text || ''),
          voiceId: options.voiceId,
          speed: options.speed,
          format: 'ogg_opus',
        }),
      });
      if (!res.ok) {
        throw new Error(`Cloud TTS HTTP ${res.status}`);
      }
      const ab = await res.arrayBuffer();
      return {
        ok: true,
        buffer: Buffer.from(ab),
        mimeType: 'audio/ogg; codecs=opus',
      };
    } catch (err) {
      return {
        ok: false,
        buffer: Buffer.alloc(0),
        mimeType: 'audio/ogg; codecs=opus',
        error: err?.message || 'CLOUD_TTS_FAILED',
      };
    }
  }
}

module.exports = { CloudVoiceAdapter };
