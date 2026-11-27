'use strict';

const { PersonaCompilerService } = require('../../ai/PersonaCompilerService');

/**
 * Registers partner configuration routes (`GET/PUT /api/v1/partners/:partnerId/config`)
 * and 3-layer persona compilation (`POST /api/v1/partners/:partnerId/specialize-prompt`).
 * Supports 15 MiB payload limit for PDF/image metadata updates.
 * @param {{
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   catalogRepository?: import('../../storage/repositories/CatalogRepository').CatalogRepository,
 *   catalogService?: import('../../domain/CatalogService').CatalogService,
 *   llmRouter?: import('../../ai/LlmRouter').LlmRouter,
 *   personaCompilerService?: PersonaCompilerService
 * }} deps
 */
function createPartnerRoutes(deps) {
  const { partnerRepository, catalogRepository, catalogService, llmRouter } = deps;
  const personaCompiler =
    deps.personaCompilerService || new PersonaCompilerService({ llmRouter });

  function toPartnerConfigDto(partner) {
    return {
      partnerId: partner.id,
      email: partner.email,
      name: partner.display_name,
      displayName: partner.display_name,
      storeSegment: partner.store_segment,
      personalityPrompt: partner.personality_prompt,
      welcomeMessage: partner.welcome_message,
      ownerJid: partner.owner_jid,
      logoDataUrl: partner.logo_data_url || null,
      pdfFiles: partner.pdf_files,
      imageFiles: partner.image_files,
      businessRules: partner.business_rules,
      businessHours: partner.working_hours,
      workingHours: partner.working_hours,
      policies: partner.policies,
      activeStatus: Number(partner.is_active) === 1 ? 'ACTIVE' : 'INACTIVE',
      featureFlags: partner.feature_flags,
      updatedAt: partner.updated_at,
    };
  }

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/config',
      handler: async ({ params, sendOk, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        return sendOk(toPartnerConfigDto(partner));
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/config',
      isUpload: true,
      handler: async ({ params, body, sendOk, sendError }) => {
        const existing = partnerRepository.findById(params.partnerId);
        if (!existing) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }

        const patch = {
          displayName: body.displayName ?? body.name,
          storeSegment: body.storeSegment ?? body.store_segment,
          personalityPrompt: body.personalityPrompt ?? body.personality_prompt,
          welcomeMessage: body.welcomeMessage ?? body.welcome_message,
          ownerJid: body.ownerJid ?? body.owner_jid,
          logoDataUrl: body.logoDataUrl ?? body.logo_data_url,
          pdfFiles: body.pdfFiles ?? body.pdf_files,
          imageFiles: body.imageFiles ?? body.image_files,
          businessRules:
            body.businessRules !== undefined && typeof body.businessRules !== 'string'
              ? JSON.stringify(body.businessRules)
              : body.businessRules ?? body.business_rules,
          workingHours:
            body.businessHours ?? body.workingHours ?? body.working_hours,
          policies: body.policies,
          isActive:
            body.activeStatus !== undefined
              ? body.activeStatus === 'ACTIVE'
              : body.isActive,
        };

        if (Array.isArray(patch.pdfFiles) && patch.pdfFiles.length > 5) {
          return sendError(400, 'VALIDATION_ERROR', 'Máximo de 5 PDFs permitidos.');
        }
        if (Array.isArray(patch.imageFiles) && patch.imageFiles.length > 10) {
          return sendError(400, 'VALIDATION_ERROR', 'Máximo de 10 imagens permitidas.');
        }

        const updated = partnerRepository.update(params.partnerId, patch);
        return sendOk(toPartnerConfigDto(updated));
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/specialize-prompt',
      handler: async ({ params, body, sendOk, sendError }) => {
        const existing = partnerRepository.findById(params.partnerId);
        if (!existing) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }

        const businessName = String(body.businessName ?? '').trim();
        const segment = String(body.segment ?? '').trim();
        const differentiators = String(body.differentiators ?? body.activities ?? '').trim();

        if (!businessName || !segment) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'Informe o Nome da Empresa (businessName) e o Segmento (segment) para especializar o MAX.'
          );
        }

        const rawCatalog = catalogRepository
          ? catalogRepository.listByPartner(params.partnerId, { activeOnly: true })
          : catalogService
            ? catalogService.listItems(params.partnerId)
            : [];

        // Pass strictly names & types (never prices) to the specialization compiler
        const safeCatalogItems = (Array.isArray(rawCatalog) ? rawCatalog : []).map((it) => ({
          name: it.name,
          type: it.item_type || it.type || 'SERVICE',
        }));

        const result = await personaCompiler.generateSpecializedPersona({
          businessName,
          segment,
          differentiators,
          catalogItems: safeCatalogItems,
        });

        return sendOk({
          compiledPrompt: result.compiledPrompt,
          layers: result.layers,
          providerUsed: result.providerUsed,
          charCount: result.charCount,
        });
      },
    },
  ];
}

module.exports = { createPartnerRoutes };
