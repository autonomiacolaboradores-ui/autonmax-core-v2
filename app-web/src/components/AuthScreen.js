'use strict';

const { icon } = require('./Icons');

/**
 * Full-screen Dark Cyber Neon login & registration overlay (`#welcomeScreen` equivalent).
 * Blocks access to the operational panel until authenticated.
 */
class AuthScreen {
  /**
   * @param {{ brandLogoUrl?: string }} [options]
   */
  constructor(options = {}) {
    this.brandLogoUrl = options.brandLogoUrl || './assets/img/logo-autonmax.jpg';
  }

  /**
   * Renders the full-screen authentication overlay.
   * @param {{ mode?: 'login' | 'register', error?: string, message?: string }} [state]
   * @returns {string}
   */
  render(state = {}) {
    const isRegister = state.mode === 'register';
    const errorHtml = state.error
      ? `<p class="auth-feedback error" data-auth-error="true">${state.error}</p>`
      : '';
    const msgHtml = state.message
      ? `<p class="auth-feedback success" data-auth-message="true">${state.message}</p>`
      : '';

    return [
      `<div class="welcome-screen" data-auth-screen="true">`,
      `  <div class="welcome-card glass-cyber">`,
      `    <img src="${this.brandLogoUrl}" alt="AUTON.MAX" class="clean-brand-logo" onerror="this.style.display='none'" />`,
      `    <h1 class="welcome-title">Bem-vindo ao <span class="cyber-accent">AUTON.MAX</span></h1>`,
      `    <p class="welcome-subtitle">Atendente para o seu negócio</p>`,
      `    <form class="welcome-form" data-auth-form="true">`,
      isRegister
        ? `<input name="displayName" type="text" class="dark-input" placeholder="Nome do Estabelecimento" required autocomplete="organization" />`
        : '',
      `      <input name="email" type="email" class="dark-input" placeholder="E-mail" required autocomplete="email" />`,
      `      <input name="password" type="password" class="dark-input" placeholder="Senha" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" />`,
      `      <div class="welcome-actions">`,
      `        <button type="submit" class="exec-action-btn primary glow-neon" style="flex: 1;" data-auth-submit="true">${icon('sparkles', { size: 16 })} <span>${isRegister ? 'Criar Conta' : 'Entrar'}</span></button>`,
      `        <button type="button" class="exec-action-btn" style="flex: 1;" data-auth-action="switch-auth">${isRegister ? 'Já tenho conta' : 'Criar Conta'}</button>`,
      `      </div>`,
      `      ${errorHtml}`,
      `      ${msgHtml}`,
      `    </form>`,
      `  </div>`,
      `</div>`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

module.exports = { AuthScreen };
