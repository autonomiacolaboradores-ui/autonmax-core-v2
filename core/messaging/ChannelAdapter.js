'use strict';

/**
 * Generic messaging ChannelAdapter contract aligned with Doc 02 Section 5.1.
 */
class ChannelAdapter {
  constructor() {
    /** @type {Array<(event: Record<string, any>) => Promise<void> | void>} */
    this._messageHandlers = [];
  }

  /**
   * Initializes a channel connection for `sessionKey`.
   * @param {string} _sessionKey
   * @returns {Promise<void>}
   */
  async connect(_sessionKey) {
    throw new Error('ChannelAdapter.connect() must be implemented by subclass');
  }

  /**
   * Disconnects and cleans up listeners for `sessionKey`.
   * @param {string} _sessionKey
   * @returns {Promise<void>}
   */
  async disconnect(_sessionKey) {
    throw new Error('ChannelAdapter.disconnect() must be implemented by subclass');
  }

  /**
   * Returns current connection state.
   * @param {string} _sessionKey
   * @returns {Promise<'DISCONNECTED' | 'PAIRING_READY' | 'CONNECTED' | 'RECONNECTING' | 'STANDBY'>}
   */
  async getStatus(_sessionKey) {
    throw new Error('ChannelAdapter.getStatus() must be implemented by subclass');
  }

  /**
   * Returns QR code data URL and raw payload if pairing.
   * @param {string} _sessionKey
   * @returns {Promise<{ qrBase64: string, rawText: string } | null>}
   */
  async getQr(_sessionKey) {
    throw new Error('ChannelAdapter.getQr() must be implemented by subclass');
  }

  /**
   * Sends a structured outbound message.
   * @param {string} _sessionKey
   * @param {string} _recipientId
   * @param {{ text?: string, mediaUrl?: string, type?: 'text' | 'image' | 'audio' | 'document' }} _payload
   * @returns {Promise<{ messageId: string, timestamp: string }>}
   */
  async sendMessage(_sessionKey, _recipientId, _payload) {
    throw new Error('ChannelAdapter.sendMessage() must be implemented by subclass');
  }

  /**
   * Updates presence indicator (`composing`, `recording`, `paused`).
   * @param {string} _sessionKey
   * @param {string} _recipientId
   * @param {'composing' | 'recording' | 'paused'} _state
   * @returns {Promise<void>}
   */
  async sendPresence(_sessionKey, _recipientId, _state) {
    throw new Error('ChannelAdapter.sendPresence() must be implemented by subclass');
  }

  /**
   * Registers an inbound normalized message listener.
   * @param {(event: Record<string, any>) => Promise<void> | void} handler
   * @returns {() => void}
   */
  onMessage(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('ChannelAdapter.onMessage requires a function');
    }
    this._messageHandlers.push(handler);
    return () => {
      const idx = this._messageHandlers.indexOf(handler);
      if (idx !== -1) this._messageHandlers.splice(idx, 1);
    };
  }

  /**
   * Emits a normalized inbound message event to all registered handlers.
   * @param {Record<string, any>} event
   * @protected
   */
  async _emitMessage(event) {
    for (const handler of [...this._messageHandlers]) {
      await handler(event);
    }
  }
}

module.exports = { ChannelAdapter };
