import { GraphWriteService, type UpsertConceptDto } from './graphWriteService.js';

export interface CapturedConceptInput {
  label: string;
  type?: string;
  jurisdiction?: string;
  domain?: string;
  kind?: string;
  prefLabel?: string;
  altLabels?: string[];
  definition?: string;
  sourceUrls?: string[];
  canonicalId?: string;
  nodeId?: string;
}

function normalizeConcept(concept: CapturedConceptInput): UpsertConceptDto | null {
  const domain = concept.domain?.trim() || concept.type?.trim();
  const kind = concept.kind?.trim() || concept.label?.trim();
  const jurisdiction = concept.jurisdiction?.trim();
  const prefLabel = concept.prefLabel?.trim() || concept.label?.trim();

  if (!domain || !kind || !jurisdiction || !prefLabel) {
    console.warn('[concept] Skipping captured concept with missing required fields', {
      domain,
      kind,
      jurisdiction,
      prefLabel,
    });
    return null;
  }

  const canonicalId =
    concept.canonicalId?.trim() || concept.nodeId?.trim() || `${domain}:${jurisdiction}:${kind}`;

  const altLabels = (concept.altLabels || [])
    .map(label => label?.trim())
    .filter((label): label is string => Boolean(label));

  return {
    id: canonicalId,
    domain: domain.toUpperCase(),
    kind: kind.toUpperCase(),
    jurisdiction: jurisdiction.toUpperCase(),
    pref_label: prefLabel,
    alt_labels: altLabels.length ? altLabels : undefined,
    definition: concept.definition,
    source_urls: concept.sourceUrls,
  };
}

/**
 * Default canonical concept handler used by the ComplianceEngine
 */
export function createCanonicalConceptHandler() {
  return {
    async resolveAndUpsert(
      concepts: CapturedConceptInput[],
      graphWriteService: GraphWriteService
    ): Promise<string[]> {
      if (!Array.isArray(concepts) || !concepts.length) {
        return [];
      }

      const resolvedNodeIds: string[] = [];

      for (const concept of concepts) {
        const normalized = normalizeConcept(concept);
        if (!normalized) {
          continue;
        }

        try {
          await graphWriteService.upsertConcept(normalized);
          resolvedNodeIds.push(normalized.id);
        } catch (error) {
          console.warn('[concept] Failed to upsert captured concept', { concept: normalized, error });
        }
      }

      return resolvedNodeIds;
    },
  };
}
