import type { Driver } from 'neo4j-driver';

import type { GraphWriteService } from './graphWriteService.js';

export interface CapturedConceptPayload {
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

export interface CanonicalConceptHandlerConfig {
  driver: Driver;
}

function slugify(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_:-]/g, '_')
    .replace(/_{2,}/g, '_');
}

function buildConceptId(concept: CapturedConceptPayload) {
  if (concept.canonicalId) return concept.canonicalId;
  if (concept.nodeId) return concept.nodeId;

  const domain = concept.domain ? slugify(concept.domain).toUpperCase() : 'GENERIC';
  const jurisdiction = concept.jurisdiction
    ? slugify(concept.jurisdiction).toUpperCase()
    : 'GLOBAL';
  const kindSource = concept.kind || concept.label || concept.prefLabel || 'CONCEPT';
  const kind = slugify(kindSource).toUpperCase();

  return `${domain}:${jurisdiction}:${kind}`;
}

async function findExistingConceptId(driver: Driver, id: string, domain?: string, kind?: string, jurisdiction?: string) {
  const session = driver.session();
  try {
    const direct = await session.run('MATCH (c:Concept {id: $id}) RETURN c.id as id LIMIT 1', { id });
    const directValue = direct.records[0]?.get('id') as string | undefined;
    if (directValue) {
      return directValue;
    }

    if (domain && kind && jurisdiction) {
      const fallback = await session.run(
        `MATCH (c:Concept {domain: $domain, kind: $kind, jurisdiction: $jurisdiction}) RETURN c.id as id LIMIT 1`,
        { domain, kind, jurisdiction },
      );
      return fallback.records[0]?.get('id') as string | undefined;
    }

    return undefined;
  } finally {
    await session.close();
  }
}

export class CanonicalConceptHandler {
  private driver: Driver;

  constructor(config: CanonicalConceptHandlerConfig) {
    this.driver = config.driver;
  }

  async resolveAndUpsert(concepts: CapturedConceptPayload[], graphWriteService: GraphWriteService) {
    const resolvedIds: string[] = [];

    for (const concept of concepts) {
      const prefLabel = concept.prefLabel || concept.label || concept.kind || concept.domain;
      if (!prefLabel) {
        continue;
      }

      const conceptId = buildConceptId(concept);
      const existingId = await findExistingConceptId(
        this.driver,
        conceptId,
        concept.domain,
        concept.kind,
        concept.jurisdiction,
      );
      const finalId = existingId || conceptId;

      const timestamp = new Date().toISOString();
      const altLabels = Array.from(
        new Set([concept.label, concept.prefLabel, ...(concept.altLabels || [])].filter(Boolean)),
      ) as string[];

      await graphWriteService.upsertConcept({
        id: finalId,
        pref_label: prefLabel,
        domain: concept.domain,
        kind: concept.kind || concept.type,
        jurisdiction: concept.jurisdiction,
        definition: concept.definition,
        alt_labels: altLabels,
        source_urls: concept.sourceUrls,
        updated_at: timestamp,
        created_at: timestamp,
      });

      for (const altLabel of altLabels) {
        const labelId = `${finalId}:LABEL:${slugify(altLabel).toUpperCase()}`;
        await graphWriteService.upsertLabel({
          id: labelId,
          value: altLabel,
          kind: 'ALT_LABEL',
        });
        await graphWriteService.createRelationship({
          fromId: finalId,
          fromLabel: 'Concept',
          toId: labelId,
          toLabel: 'Label',
          relType: 'HAS_ALT_LABEL',
        });
      }

      resolvedIds.push(finalId);
    }

    return resolvedIds;
  }
}

export function createCanonicalConceptHandler(config: CanonicalConceptHandlerConfig) {
  return new CanonicalConceptHandler(config);
}
