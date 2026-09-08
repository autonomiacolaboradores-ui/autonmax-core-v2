'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');

const requestContext = new AsyncLocalStorage();

/** Executa fn() dentro de um contexto isolado por requisição/turno. */
function runWithContext(context, fn) {
  return requestContext.run(context, fn);
}

/** Retorna o contexto do turno atual (ou {} se chamado fora de runWithContext). */
function getContext() {
  return requestContext.getStore() || {};
}

module.exports = { runWithContext, getContext };
