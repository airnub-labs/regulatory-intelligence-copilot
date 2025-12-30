-- =====================================================
-- Memgraph Index Creation Script
-- For Regulatory Intelligence Copilot Graph Database
-- =====================================================
--
-- Usage: Run this script against Memgraph to create all required indices
-- for optimal query performance.
--
-- Note: Memgraph supports label-property indices which significantly improve
-- query performance for property lookups on specific node labels.
--
-- =====================================================

-- -----------------------------------------------------
-- Primary lookup indices (critical for query performance)
-- These indices support the main ID-based lookups used throughout the application
-- -----------------------------------------------------

CREATE INDEX ON :Benefit(id);
CREATE INDEX ON :Relief(id);
CREATE INDEX ON :Section(id);
CREATE INDEX ON :Jurisdiction(id);
CREATE INDEX ON :ProfileTag(id);
CREATE INDEX ON :Obligation(id);
CREATE INDEX ON :Timeline(id);
CREATE INDEX ON :Condition(id);
CREATE INDEX ON :Threshold(id);
CREATE INDEX ON :Rate(id);
CREATE INDEX ON :Form(id);
CREATE INDEX ON :Concept(id);
CREATE INDEX ON :PRSIClass(id);
CREATE INDEX ON :NIClass(id);
CREATE INDEX ON :LifeEvent(id);
CREATE INDEX ON :Penalty(id);
CREATE INDEX ON :LegalEntity(id);
CREATE INDEX ON :TaxCredit(id);
CREATE INDEX ON :RegulatoryBody(id);
CREATE INDEX ON :AssetClass(id);
CREATE INDEX ON :MeansTest(id);
CREATE INDEX ON :BenefitCap(id);
CREATE INDEX ON :CoordinationRule(id);
CREATE INDEX ON :TaxYear(id);

-- -----------------------------------------------------
-- Timestamp indices for change detection
-- Critical for the GraphChangeDetector's timestamp-based queries
-- -----------------------------------------------------

CREATE INDEX ON :Benefit(updated_at);
CREATE INDEX ON :Relief(updated_at);
CREATE INDEX ON :Section(updated_at);
CREATE INDEX ON :Obligation(updated_at);

-- -----------------------------------------------------
-- Compound/property indices for common queries
-- These support frequently used filter conditions
-- -----------------------------------------------------

CREATE INDEX ON :TaxYear(year);
CREATE INDEX ON :TaxYear(jurisdiction);
CREATE INDEX ON :Rate(category);
CREATE INDEX ON :Threshold(unit);
CREATE INDEX ON :TaxCredit(tax_year);
CREATE INDEX ON :CoordinationRule(home_jurisdiction);
CREATE INDEX ON :CoordinationRule(host_jurisdiction);

-- -----------------------------------------------------
-- Label search indices
-- Support keyword searches in graph queries
-- -----------------------------------------------------

CREATE INDEX ON :Benefit(label);
CREATE INDEX ON :Relief(label);
CREATE INDEX ON :Section(label);
CREATE INDEX ON :Benefit(name);
CREATE INDEX ON :Relief(name);
CREATE INDEX ON :Section(name);

-- =====================================================
-- End of index creation script
-- =====================================================
