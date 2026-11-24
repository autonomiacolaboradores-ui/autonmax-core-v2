'use strict';

const FALLBACK_STT_MESSAGE =
  'Não pude processar seu áudio no momento, poderia digitar por favor?';

/**
 * Abstract VoiceAdapter contract aligned with Doc 02 Section 5.2.
 */
class VoiceAdapter {
  /**
   * Transcribes an audio buffer into text.
   * @param {Buffer} _buffer
   * @param {string} _mimeType
   * @returns {Promise<{ ok: boolean, text: string, provider: string, fallbackMessage?: string, error?: string }>}
   */
  async transcribe(_buffer, _mimeType) {
    throw new Error('VoiceAdapter.transcribe() must be implemented by subclass');
  }

  /**
   * Synthesizes text into an audio buffer (OGG/Opus recommended for WhatsApp PTT).
   * @param {string} _text
   * @param {{ voiceId?: string, speed?: number }} [_options]
   * @returns {Promise<{ ok: boolean, buffer: Buffer, mimeType: 'audio/ogg; codecs=opus' | 'audio/mp3', error?: string }>}
   */
  async synthesize(_text, _options = {}) {
    throw new Error('VoiceAdapter.synthesize() must be implemented by subclass');
  }
}

VoiceAdapter.FALLBACK_STT_MESSAGE = FALLBACK_STT_MESSAGE;

module.exports = { VoiceAdapter, FALLBACK_STT_MESSAGE };
