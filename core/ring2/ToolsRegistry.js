'use strict';

/**
 * ToolsRegistry — OPS-6
 * Lista canónica de tools + selfTest no boot.
 * Persistência: workspace/tools_readiness.json
 */

const fs = require('node:fs');
const path = require('node:path');

const READINESS_PATH = path.join(__dirname, '../../workspace/tools_readiness.json');

/** Canonical product tools — Max Atendente (PME + agenda + docs + search + calendar) */
const CANONICAL_TOOLS = [
  // Docs
  'fetch_url_text',
  'compile_markdown',
  'compile_pdf',
  // Search
  'WebSearchEngine',
  // PME
  'getAvailableSlots',
  'createAppointment',
  'getCatalog',
  'getPolicies',
  'list_services',
  'get_service_details',
  'get_business_hours',
  'get_store_policies',
  'get_store_profile',
  'search_knowledge_base',
  'get_next_available_slot',
  'validate_booking_ready',
  'get_attendant_metrics',
  'estimate_visit_duration',
  'cancel_appointment',
  // Native (booking + attendant helpers)
  'book_appointment_confirmed',
  'list_my_appointments',
  'reschedule_appointment',
  'get_travel_time',
  'compare_services',
  'upsell_safe',
  'faq_from_pdf',
  'generate_booking_card',
  'split_bill',
  'unit_convert',
  'follow_url_summarize',
  // Calendar
  'calendar_list',
  'calendar_create',
  'calendar_update',
  'calendar_cancel'
];

class ToolsRegistry {
  constructor(options = {}) {
    this.canonical = options.canonical || CANONICAL_TOOLS.slice();
    this.readinessPath = options.readinessPath || READINESS_PATH;
    this.lastReport = null;
  }

  /**
   * Collect declared tool names from GeminiToolsDispatcher if available.
   */
  listDeclared() {
    try {
      const GeminiToolsDispatcher = require('./GeminiToolsDispatcher');
      const decls =
        typeof GeminiToolsDispatcher.functionDeclarations === 'function'
          ? GeminiToolsDispatcher.functionDeclarations()
          : typeof GeminiToolsDispatcher.getFunctionDeclarations === 'function'
            ? GeminiToolsDispatcher.getFunctionDeclarations()
            : [];
      const names = new Set();
      for (const d of decls) {
        if (d && d.name) names.add(d.name);
        if (d && d.function && d.function.name) names.add(d.function.name);
      }
      // Also try instance style
      if (names.size === 0) {
        try {
          const inst = new GeminiToolsDispatcher({});
          const d2 =
            typeof inst.getFunctionDeclarations === 'function'
              ? inst.getFunctionDeclarations()
              : inst.functionDeclarations || [];
          for (const d of d2) {
            if (d && d.name) names.add(d.name);
            if (d && d.function && d.function.name) names.add(d.function.name);
          }
        } catch (_) {}
      }
      return [...names];
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Module require smoke tests (no network for optional free tools unless live=true).
   */
  async selfTest(options = {}) {
    const live = !!options.live;
    const results = [];
    const declared = this.listDeclared();
    const declaredSet = new Set(Array.isArray(declared) ? declared : []);

    // Require graph
    const modules = [
      ['DocumentTools', './DocumentTools'],
      ['PmeBookingTools', './PmeBookingTools'],
      ['MaxNativeTools', './MaxNativeTools'],
      ['WebSearchEngine', './WebSearchEngine'],
      ['GeminiToolsDispatcher', './GeminiToolsDispatcher']
    ];
    for (const [name, rel] of modules) {
      try {
        require(rel);
        results.push({ check: `require:${name}`, ok: true });
      } catch (e) {
        results.push({ check: `require:${name}`, ok: false, error: e.message });
      }
    }

    // Canonical presence in declarations (best-effort)
    for (const tool of this.canonical) {
      if (Array.isArray(declared)) {
        const ok = declaredSet.has(tool);
        results.push({
          check: `declared:${tool}`,
          ok,
          optional: false,
          note: ok ? null : 'not in functionDeclarations snapshot'
        });
      }
    }

    // Live probes desativados (sem free-utility tools genéricas)

    const failed = results.filter((r) => r.ok === false && !r.optional);
    const report = {
      at: new Date().toISOString(),
      ok: failed.length === 0,
      failed: failed.length,
      total: results.length,
      declaredCount: Array.isArray(declared) ? declared.length : 0,
      declared: Array.isArray(declared) ? declared : [],
      results
    };
    this.lastReport = report;
    try {
      fs.mkdirSync(path.dirname(this.readinessPath), { recursive: true });
      fs.writeFileSync(this.readinessPath, JSON.stringify(report, null, 2));
    } catch (_) {}
    return report;
  }
}

module.exports = { ToolsRegistry, CANONICAL_TOOLS, READINESS_PATH };
