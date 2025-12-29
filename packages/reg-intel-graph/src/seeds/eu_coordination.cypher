// ============================================================================
// EU SOCIAL SECURITY COORDINATION RULES
// Based on Regulation (EC) No 883/2004 and (EC) No 987/2009
// ============================================================================

// Posted Workers - IE to FR
MERGE (cr:CoordinationRule {id: 'EU_POSTED_WORKER_IE_FR'})
SET cr.label = 'Posted Worker Rule - Ireland to France',
    cr.regulation = 'EC 883/2004',
    cr.article = 'Article 12',
    cr.applies_to = 'Posted Workers',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'FR',
    cr.duration_months = 24,
    cr.description = 'Person posted by employer from Ireland to France remains subject to Irish social security for up to 24 months',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime();

// Posted Workers - IE to DE
MERGE (cr:CoordinationRule {id: 'EU_POSTED_WORKER_IE_DE'})
SET cr.label = 'Posted Worker Rule - Ireland to Germany',
    cr.regulation = 'EC 883/2004',
    cr.article = 'Article 12',
    cr.applies_to = 'Posted Workers',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'DE',
    cr.duration_months = 24,
    cr.description = 'Person posted by employer from Ireland to Germany remains subject to Irish social security for up to 24 months',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime();

// Posted Workers - IE to NL
MERGE (cr:CoordinationRule {id: 'EU_POSTED_WORKER_IE_NL'})
SET cr.label = 'Posted Worker Rule - Ireland to Netherlands',
    cr.regulation = 'EC 883/2004',
    cr.article = 'Article 12',
    cr.applies_to = 'Posted Workers',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'NL',
    cr.duration_months = 24,
    cr.description = 'Person posted by employer from Ireland to Netherlands remains subject to Irish social security for up to 24 months',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime();

// Multi-State Workers - IE/FR
MERGE (cr:CoordinationRule {id: 'EU_MULTI_STATE_IE_FR'})
SET cr.label = 'Multi-State Worker Rule - Ireland/France',
    cr.regulation = 'EC 883/2004',
    cr.article = 'Article 13',
    cr.applies_to = 'Multi-State Workers',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'FR',
    cr.description = 'Person working in both Ireland and France - legislation determined by substantial activity or residence',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime();

// Posted Self-Employed - IE to FR
MERGE (cr:CoordinationRule {id: 'EU_POSTED_SELF_IE_FR'})
SET cr.label = 'Posted Self-Employed - Ireland to France',
    cr.regulation = 'EC 883/2004',
    cr.article = 'Article 12(2)',
    cr.applies_to = 'Self-Employed',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'FR',
    cr.duration_months = 24,
    cr.description = 'Self-employed person temporarily working in France remains under Irish social security for up to 24 months',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime();

// Family Benefits Coordination - IE/UK (Post-Brexit TCA)
MERGE (cr:CoordinationRule {id: 'TCA_FAMILY_BENEFITS_IE_UK'})
SET cr.label = 'Family Benefits Coordination - Ireland/UK',
    cr.regulation = 'Trade and Cooperation Agreement',
    cr.article = 'SSC Annex',
    cr.applies_to = 'Family Benefits',
    cr.home_jurisdiction = 'IE',
    cr.host_jurisdiction = 'UK',
    cr.description = 'Coordination of family benefits for persons moving between Ireland and UK under TCA',
    cr.created_at = localdatetime(),
    cr.updated_at = localdatetime();

// ============================================================================
// LINK COORDINATION RULES TO BENEFITS
// ============================================================================

// Posted worker rules coordinate all social insurance benefits
MATCH (cr:CoordinationRule)
WHERE cr.applies_to = 'Posted Workers'
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j:Jurisdiction)
WHERE j.id = cr.home_jurisdiction
  AND (b.category = 'SOCIAL_INSURANCE' OR b.id CONTAINS 'PRSI')
MERGE (b)-[:COORDINATED_UNDER]->(cr);

// Multi-state rules coordinate employment benefits
MATCH (cr:CoordinationRule)
WHERE cr.applies_to = 'Multi-State Workers'
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j:Jurisdiction)
WHERE j.id = cr.home_jurisdiction
  AND b.category = 'SOCIAL_INSURANCE'
MERGE (b)-[:COORDINATED_UNDER]->(cr);

// Family benefits coordination
MATCH (cr:CoordinationRule {id: 'TCA_FAMILY_BENEFITS_IE_UK'})
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
WHERE b.id CONTAINS 'CHILD' OR b.id CONTAINS 'FAMILY'
MERGE (b)-[:COORDINATED_UNDER]->(cr);

// ============================================================================
// LINK TO PROFILE TAGS
// ============================================================================

// Posted workers profile
MATCH (cr:CoordinationRule)
WHERE cr.applies_to = 'Posted Workers'
MATCH (pt:ProfileTag)
WHERE pt.id IN ['posted-worker', 'cross-border-worker']
MERGE (pt)-[:POSTED_TO]->(cr);

// Self-employed profile
MATCH (cr:CoordinationRule)
WHERE cr.applies_to = 'Self-Employed'
MATCH (pt:ProfileTag)
WHERE pt.id IN ['self-employed', 'sole-trader']
MERGE (pt)-[:POSTED_TO]->(cr);
