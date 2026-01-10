#!/usr/bin/env tsx
/**
 * REALISTIC GRAPH SEED DATA
 *
 * This script seeds Memgraph with realistic Irish tax and regulatory nodes
 * that align with the Supabase conversation seed data.
 *
 * Coverage:
 * - Corporation Tax (CT) with R&D credits
 * - VAT (B2B, B2C, MOSS, registration thresholds)
 * - Personal taxation (PAYE, PRSI, USC)
 * - Benefit-in-Kind (BIK) - company cars
 * - Share schemes (KEEP, ESOS, ESOP)
 * - Capital Gains Tax (CGT) reliefs (Entrepreneur Relief, Retirement Relief)
 * - Close Company rules
 * - Knowledge Development Box (KDB)
 * - Maternity Benefit
 * - Home office expenses
 *
 * Run: pnpm seed:graph:realistic
 */

import { loadEnv } from './load-env.js';
import neo4j, { Driver } from 'neo4j-driver';
import pino from 'pino';

// Load environment variables from .env.local or .env
loadEnv();
import {
  createGraphWriteService,
  type GraphWriteService,
} from '../packages/reg-intel-graph/src/index.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

function createDriver(): Driver {
  const uri = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
  const username = process.env.MEMGRAPH_USERNAME || '';
  const password = process.env.MEMGRAPH_PASSWORD || '';

  logger.info({ uri }, '🔌 Connecting to Memgraph...');

  return neo4j.driver(uri, neo4j.auth.basic(username, password), {
    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
  });
}

function log(...args: unknown[]) {
  logger.info(args.join(' '));
}

function logError(...args: unknown[]) {
  logger.error(args.join(' '));
}

async function seedGraph(logger: typeof pino.prototype) {
  const driver = createDriver();

  const writeService: GraphWriteService = createGraphWriteService({
    driver,
    defaultSource: 'script',
    tenantId: 'system',
  });

  try {
    log('\n🌱 Starting realistic graph seed...\n');

    // ==================================================================================
    // JURISDICTIONS
    // ==================================================================================
    log('🌍 Creating jurisdictions...');

    await writeService.upsertJurisdiction({
      id: 'IE',
      name: 'Ireland',
      type: 'COUNTRY',
      notes: 'Republic of Ireland - Primary jurisdiction for seed data',
    });

    await writeService.upsertJurisdiction({
      id: 'EU',
      name: 'European Union',
      type: 'SUPRANATIONAL',
      notes: 'European Union - VAT directives and transfer pricing rules',
    });

    // UK and Northern Ireland (post-Brexit, NI Protocol)
    await writeService.upsertJurisdiction({
      id: 'UK',
      name: 'United Kingdom',
      type: 'COUNTRY',
      notes: 'Post-Brexit: No longer part of EU single market/customs union. Special arrangements for NI.',
    });

    await writeService.upsertJurisdiction({
      id: 'GB',
      name: 'Great Britain',
      type: 'COUNTRY',
      notes: 'England, Scotland, Wales. UK excluding Northern Ireland. Full Brexit applies.',
    });

    await writeService.upsertJurisdiction({
      id: 'NI',
      name: 'Northern Ireland',
      type: 'REGION',
      notes: 'Special status under NI Protocol: EU customs/VAT rules for goods, UK rules for services.',
    });

    // USA (common for Irish tech expansion)
    await writeService.upsertJurisdiction({
      id: 'US',
      name: 'United States',
      type: 'COUNTRY',
      notes: 'Key market for Irish tech companies. Ireland-US tax treaty. Delaware incorporation common.',
    });

    // Key EU Member States (common trade partners)
    await writeService.upsertJurisdiction({
      id: 'DE',
      name: 'Germany',
      type: 'COUNTRY',
      notes: 'EU member. Largest EU economy. 19% VAT, 15% + solidarity CT rate.',
    });

    await writeService.upsertJurisdiction({
      id: 'FR',
      name: 'France',
      type: 'COUNTRY',
      notes: 'EU member. 20% VAT, 25% CT rate. Strong tech sector.',
    });

    await writeService.upsertJurisdiction({
      id: 'NL',
      name: 'Netherlands',
      type: 'COUNTRY',
      notes: 'EU member. Common holding company jurisdiction. Innovation box (9% rate). 21% VAT.',
    });

    // Tax planning jurisdictions (for completeness, showing why Ireland is better)
    await writeService.upsertJurisdiction({
      id: 'CY',
      name: 'Cyprus',
      type: 'COUNTRY',
      notes: 'EU member. 12.5% CT, IP box regime. Subject to BEPS/ATAD scrutiny.',
    });

    await writeService.upsertJurisdiction({
      id: 'MT',
      name: 'Malta',
      type: 'COUNTRY',
      notes: 'EU member. 35% CT with refund system (effective 5%). Subject to EU scrutiny.',
    });

    await writeService.upsertJurisdiction({
      id: 'LU',
      name: 'Luxembourg',
      type: 'COUNTRY',
      notes: 'EU member. Common for investment funds and financing structures. IP box regime.',
    });

    await writeService.upsertJurisdiction({
      id: 'IM',
      name: 'Isle of Man',
      type: 'CROWN_DEPENDENCY',
      notes: 'Crown Dependency. 0% CT (10% for banking/retail). Outside EU but special VAT arrangements.',
    });

    log('   ✅ Created: IE, EU, UK, GB, NI, US, DE, FR, NL, CY, MT, LU, IM\n');

    // ==================================================================================
    // STATUTES (Primary Legislation)
    // ==================================================================================
    log('📜 Creating statutes...');

    await writeService.upsertStatute({
      id: 'IE_TCA_1997',
      name: 'Taxes Consolidation Act 1997',
      citation: 'TCA 1997',
      type: 'PRIMARY',
      jurisdictionId: 'IE',
      source_url: 'https://www.irishstatutebook.ie/eli/1997/act/39/enacted/en/html',
    });

    await writeService.upsertStatute({
      id: 'IE_VATA_2010',
      name: 'Value-Added Tax Consolidation Act 2010',
      citation: 'VATCA 2010',
      type: 'PRIMARY',
      jurisdictionId: 'IE',
      source_url: 'https://www.irishstatutebook.ie/eli/2010/act/31/enacted/en/html',
    });

    await writeService.upsertStatute({
      id: 'IE_SW_CONS_ACT_2005',
      name: 'Social Welfare Consolidation Act 2005',
      citation: 'SWCA 2005',
      type: 'PRIMARY',
      jurisdictionId: 'IE',
      source_url: 'https://www.irishstatutebook.ie/eli/2005/act/26/enacted/en/html',
    });

    log('   ✅ Created: TCA 1997, VATCA 2010, SWCA 2005\n');

    // ==================================================================================
    // EU DIRECTIVES (Multi-Jurisdictional)
    // ==================================================================================
    log('🇪🇺 Creating EU Directives...');

    // Parent-Subsidiary Directive (relevant for Irish holding companies)
    await writeService.upsertStatute({
      id: 'EU_DIR_2011_96',
      name: 'Parent-Subsidiary Directive',
      citation: 'Directive 2011/96/EU',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0096',
    });

    // Interest and Royalties Directive (intra-group payments)
    await writeService.upsertStatute({
      id: 'EU_DIR_2003_49',
      name: 'Interest and Royalties Directive',
      citation: 'Directive 2003/49/EC',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32003L0049',
    });

    // ATAD (Anti-Tax Avoidance Directive) - impacts Irish tax planning
    await writeService.upsertStatute({
      id: 'EU_DIR_2016_1164',
      name: 'Anti-Tax Avoidance Directive (ATAD)',
      citation: 'Directive 2016/1164/EU',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016L1164',
    });

    // ATAD II (Hybrid Mismatch Rules)
    await writeService.upsertStatute({
      id: 'EU_DIR_2017_952',
      name: 'ATAD II (Hybrid Mismatches)',
      citation: 'Directive 2017/952/EU',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017L0952',
    });

    // DAC6 (Mandatory Disclosure Rules) - impacts advisors
    await writeService.upsertStatute({
      id: 'EU_DIR_2018_822',
      name: 'DAC6 (Mandatory Disclosure Rules)',
      citation: 'Directive 2018/822/EU',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018L0822',
    });

    // Pillar 2 Global Minimum Tax Directive
    await writeService.upsertStatute({
      id: 'EU_DIR_2022_2523',
      name: 'Pillar 2 Minimum Tax Directive',
      citation: 'Directive 2022/2523/EU',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2523',
    });

    // VAT Directive (base for all EU VAT)
    await writeService.upsertStatute({
      id: 'EU_DIR_2006_112',
      name: 'VAT Directive',
      citation: 'Directive 2006/112/EC',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0112',
    });

    // Social Security Coordination Regulation
    await writeService.upsertStatute({
      id: 'EU_REG_883_2004',
      name: 'Social Security Coordination Regulation',
      citation: 'Regulation 883/2004/EC',
      type: 'REGULATION',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0883',
    });

    // Posted Workers Directive
    await writeService.upsertStatute({
      id: 'EU_DIR_2018_957',
      name: 'Posted Workers Directive (Revised)',
      citation: 'Directive 2018/957/EU',
      type: 'DIRECTIVE',
      jurisdictionId: 'EU',
      source_url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018L0957',
    });

    log('   ✅ Created: 9 EU Directives/Regulations\n');

    // ==================================================================================
    // UK STATUTES (Post-Brexit Context)
    // ==================================================================================
    log('🇬🇧 Creating UK statutes...');

    await writeService.upsertStatute({
      id: 'UK_CTA_2010',
      name: 'Corporation Tax Act 2010',
      citation: 'CTA 2010',
      type: 'PRIMARY',
      jurisdictionId: 'UK',
      source_url: 'https://www.legislation.gov.uk/ukpga/2010/4/contents',
    });

    await writeService.upsertStatute({
      id: 'UK_ITEPA_2003',
      name: 'Income Tax (Earnings and Pensions) Act 2003',
      citation: 'ITEPA 2003',
      type: 'PRIMARY',
      jurisdictionId: 'UK',
      source_url: 'https://www.legislation.gov.uk/ukpga/2003/1/contents',
    });

    await writeService.upsertStatute({
      id: 'UK_VATA_1994',
      name: 'Value Added Tax Act 1994',
      citation: 'VATA 1994',
      type: 'PRIMARY',
      jurisdictionId: 'UK',
      source_url: 'https://www.legislation.gov.uk/ukpga/1994/23/contents',
    });

    // NI Protocol (critical for cross-border trade)
    await writeService.upsertStatute({
      id: 'UK_NI_PROTOCOL',
      name: 'Northern Ireland Protocol',
      citation: 'Windsor Framework',
      type: 'INTERNATIONAL',
      jurisdictionId: 'NI',
      source_url: 'https://commission.europa.eu/strategy-and-policy/relations-non-eu-countries/relations-united-kingdom/windsor-framework_en',
    });

    log('   ✅ Created: 4 UK/NI statutes\n');

    // ==================================================================================
    // TAX TREATIES (Bilateral Agreements)
    // ==================================================================================
    log('🤝 Creating tax treaties...');

    // Ireland-UK DTA (critical post-Brexit)
    await writeService.upsertStatute({
      id: 'TREATY_IE_UK_1976',
      name: 'Ireland-UK Double Taxation Agreement',
      citation: 'S.I. 319/1976',
      type: 'TREATY',
      jurisdictionId: 'IE',
      source_url: 'https://www.revenue.ie/en/tax-professionals/tax-agreements/double-taxation-treaties/uk/index.aspx',
    });

    // Ireland-US DTA (critical for tech sector)
    await writeService.upsertStatute({
      id: 'TREATY_IE_US_1997',
      name: 'Ireland-US Double Taxation Agreement',
      citation: 'S.I. 28/1998',
      type: 'TREATY',
      jurisdictionId: 'IE',
      source_url: 'https://www.revenue.ie/en/tax-professionals/tax-agreements/double-taxation-treaties/usa/index.aspx',
    });

    // Ireland-Germany DTA
    await writeService.upsertStatute({
      id: 'TREATY_IE_DE_2011',
      name: 'Ireland-Germany Double Taxation Agreement',
      citation: 'S.I. 368/2013',
      type: 'TREATY',
      jurisdictionId: 'IE',
      source_url: 'https://www.revenue.ie/en/tax-professionals/tax-agreements/double-taxation-treaties/germany/index.aspx',
    });

    // Ireland-Netherlands DTA
    await writeService.upsertStatute({
      id: 'TREATY_IE_NL_1969',
      name: 'Ireland-Netherlands Double Taxation Agreement',
      citation: 'S.I. 95/1970',
      type: 'TREATY',
      jurisdictionId: 'IE',
      source_url: 'https://www.revenue.ie/en/tax-professionals/tax-agreements/double-taxation-treaties/netherlands/index.aspx',
    });

    // Ireland-Cyprus DTA (holding company route)
    await writeService.upsertStatute({
      id: 'TREATY_IE_CY_1968',
      name: 'Ireland-Cyprus Double Taxation Agreement',
      citation: 'S.I. 264/1971',
      type: 'TREATY',
      jurisdictionId: 'IE',
      source_url: 'https://www.revenue.ie/en/tax-professionals/tax-agreements/double-taxation-treaties/cyprus/index.aspx',
    });

    // MLI (Multilateral Instrument - modifies treaties)
    await writeService.upsertStatute({
      id: 'OECD_MLI_2017',
      name: 'Multilateral Convention to Implement Tax Treaty Related Measures (MLI)',
      citation: 'OECD MLI',
      type: 'MULTILATERAL',
      jurisdictionId: 'IE',
      source_url: 'https://www.oecd.org/tax/treaties/multilateral-convention-to-implement-tax-treaty-related-measures-to-prevent-beps.htm',
    });

    log('   ✅ Created: 6 tax treaties\n');

    // ==================================================================================
    // SECTIONS (Referenced in conversations)
    // ==================================================================================
    log('📄 Creating statute sections...');

    // Corporation Tax sections
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S21',
      label: 'Section 21',
      title: 'Corporation Tax Rate (Trading Income)',
      text_excerpt: 'The standard rate of corporation tax on trading income shall be 12.5%',
      section_number: '21',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S766',
      label: 'Section 766',
      title: 'R&D Tax Credit',
      text_excerpt: 'Tax credit of 25% for qualifying research and development expenditure',
      section_number: '766',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S440',
      label: 'Section 440',
      title: 'Close Company Surcharge',
      text_excerpt: 'Close companies liable to surcharge of 20% on undistributed investment and rental income',
      section_number: '440',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Capital Gains Tax sections
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S597',
      label: 'Section 597',
      title: 'Entrepreneur Relief',
      text_excerpt: 'CGT relief at 10% rate on disposal of qualifying business assets, €1M lifetime limit',
      section_number: '597',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S598',
      label: 'Section 598',
      title: 'Retirement Relief',
      text_excerpt: 'CGT exemption up to €750,000 on disposal of business by person aged 55+',
      section_number: '598',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Share scheme sections
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S128E',
      label: 'Section 128E',
      title: 'KEEP (Key Employee Engagement Programme)',
      text_excerpt: 'No income tax, USC, or PRSI on exercise of qualifying share options up to €300,000 over 3 years',
      section_number: '128E',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S519',
      label: 'Section 519',
      title: 'ESOS (Employee Share Ownership Schemes)',
      text_excerpt: 'No income tax or USC on grant of shares up to €12,700/year if held for 3 years',
      section_number: '519',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Benefit-in-Kind sections
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S121',
      label: 'Section 121',
      title: 'Benefit-in-Kind (Company Cars)',
      text_excerpt: 'Taxable benefit calculated based on OMV, CO2 emissions, and business mileage',
      section_number: '121',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Knowledge Development Box
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S769I',
      label: 'Section 769I',
      title: 'Knowledge Development Box',
      text_excerpt: 'Effective 6.25% CT rate on qualifying IP income from patents and software copyright',
      section_number: '769I',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // VAT sections
    await writeService.upsertSection({
      id: 'IE_VATCA_2010_S65',
      label: 'Section 65',
      title: 'VAT Registration Threshold',
      text_excerpt: 'Mandatory VAT registration when turnover exceeds thresholds: €40K services, €80K goods',
      section_number: '65',
      statuteId: 'IE_VATA_2010',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_VATCA_2010_S46',
      label: 'Section 46',
      title: 'VAT Reverse Charge (B2B)',
      text_excerpt: 'Reverse charge mechanism for B2B supplies to VAT-registered businesses in other EU states',
      section_number: '46',
      statuteId: 'IE_VATA_2010',
      jurisdictionId: 'IE',
    });

    // Social Welfare sections
    await writeService.upsertSection({
      id: 'IE_SWCA_2005_S55',
      label: 'Section 55',
      title: 'Maternity Benefit',
      text_excerpt: 'Maternity benefit of €274/week for 26 weeks, requires 52 weeks PRSI in previous 2 years',
      section_number: '55',
      statuteId: 'IE_SW_CONS_ACT_2005',
      jurisdictionId: 'IE',
    });

    // Income Tax sections (Seán's salary/dividend conversations)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S15',
      label: 'Section 15',
      title: 'Income Tax Standard Rate',
      text_excerpt: 'Standard rate of income tax is 20% on income up to the standard rate cut-off point',
      section_number: '15',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S16',
      label: 'Section 16',
      title: 'Income Tax Higher Rate',
      text_excerpt: 'Higher rate of income tax is 40% on income above the standard rate cut-off point (€42,000 single)',
      section_number: '16',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S531AN',
      label: 'Section 531AN',
      title: 'Universal Social Charge (USC)',
      text_excerpt: 'USC rates: 0.5% (first €12,012), 2% (€12,012-€25,760), 4% (€25,760-€70,044), 8% (above €70,044)',
      section_number: '531AN',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Capital Allowances section (DataTech HR - company car)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S284',
      label: 'Section 284',
      title: 'Capital Allowances - Wear and Tear',
      text_excerpt: 'Wear and tear allowance of 12.5% per annum for plant and machinery over 8 years',
      section_number: '284',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S380K',
      label: 'Section 380K',
      title: 'Capital Allowances - Motor Vehicles',
      text_excerpt: 'Capital allowances for motor vehicles capped at €24,000 regardless of actual cost',
      section_number: '380K',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Home Office section (Seán's conversations)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S114',
      label: 'Section 114',
      title: 'Remote Working Relief',
      text_excerpt: 'Employees working from home may claim 30% of broadband and 10% of heat/electricity, or €3.20/day flat rate',
      section_number: '114',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // PRSI section
    await writeService.upsertSection({
      id: 'IE_SWCA_2005_S13',
      label: 'Section 13',
      title: 'PRSI Contribution Rates',
      text_excerpt: 'Class A: Employee 4.1%, Employer 11.05%. Class S (self-employed): 4%',
      section_number: '13',
      statuteId: 'IE_SW_CONS_ACT_2005',
      jurisdictionId: 'IE',
    });

    log('   ✅ Created: 19 Irish statute sections\n');

    // ==================================================================================
    // CROSS-BORDER SECTIONS (Multi-Jurisdictional)
    // ==================================================================================
    log('🌍 Creating cross-border sections...');

    // --- Irish Implementation of EU Directives ---

    // ATAD Implementation - Interest Limitation Rule (IE)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S835AAA',
      label: 'Section 835AAA',
      title: 'Interest Limitation Rule (ATAD)',
      text_excerpt: 'Deductible interest limited to 30% of EBITDA. Implements EU ATAD Article 4.',
      section_number: '835AAA',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // ATAD Implementation - Exit Tax (IE)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S627A',
      label: 'Section 627A',
      title: 'Exit Tax (ATAD)',
      text_excerpt: 'Exit tax on migration of companies or transfer of assets from Ireland. Implements ATAD Article 5.',
      section_number: '627A',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // ATAD Implementation - CFC Rules (IE)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S835R',
      label: 'Section 835R',
      title: 'Controlled Foreign Company Rules (ATAD)',
      text_excerpt: 'CFC rules attributing undistributed profits of low-taxed subsidiaries. Implements ATAD Article 7.',
      section_number: '835R',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // ATAD Implementation - Hybrid Mismatch (IE)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S835W',
      label: 'Section 835W',
      title: 'Hybrid Mismatch Rules (ATAD II)',
      text_excerpt: 'Anti-hybrid rules preventing D/NI and DD outcomes. Implements ATAD II (Directive 2017/952).',
      section_number: '835W',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Transfer Pricing (IE) - Part 35A
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S835C',
      label: 'Section 835C',
      title: 'Transfer Pricing Rules',
      text_excerpt: 'Transactions between associated persons must be at arms length. OECD Transfer Pricing Guidelines apply.',
      section_number: '835C',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // PE Rules (IE)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S25',
      label: 'Section 25',
      title: 'Permanent Establishment (Non-Resident)',
      text_excerpt: 'Non-resident company with PE in Ireland taxable on PE profits at 12.5%. Definition aligns with OECD Model.',
      section_number: '25',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // DAC6 Implementation (IE)
    await writeService.upsertSection({
      id: 'IE_TCA_1997_S817RA',
      label: 'Section 817RA',
      title: 'DAC6 Mandatory Disclosure',
      text_excerpt: 'Intermediaries and taxpayers must report cross-border arrangements with specified hallmarks.',
      section_number: '817RA',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // Pillar 2 Implementation (IE)
    await writeService.upsertSection({
      id: 'IE_FA_2023_PILLAR2',
      label: 'Finance Act 2023 Part 4',
      title: 'Pillar 2 Global Minimum Tax',
      text_excerpt: '15% global minimum tax for MNE groups with €750M+ revenue. IIR, UTPR, and QDMTT rules.',
      section_number: 'Part 4',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    // --- Cross-Border VAT ---

    // VAT on Services to UK Post-Brexit (IE)
    await writeService.upsertSection({
      id: 'IE_VATCA_2010_S33',
      label: 'Section 33',
      title: 'Place of Supply - B2B Services',
      text_excerpt: 'B2B services taxable where customer established. UK now treated as third country post-Brexit.',
      section_number: '33',
      statuteId: 'IE_VATA_2010',
      jurisdictionId: 'IE',
    });

    // VAT on Goods to NI (Special)
    await writeService.upsertSection({
      id: 'IE_VATCA_2010_NI_GOODS',
      label: 'NI Protocol - Goods VAT',
      title: 'VAT on Goods to Northern Ireland',
      text_excerpt: 'Goods to NI treated as intra-EU supply (XI prefix). EU VAT rules continue for goods movements.',
      section_number: 'NI Protocol',
      statuteId: 'IE_VATA_2010',
      jurisdictionId: 'IE',
    });

    // EU Reverse Charge (IE)
    await writeService.upsertSection({
      id: 'IE_VATCA_2010_S56',
      label: 'Section 56',
      title: 'Intra-Community Acquisition Reverse Charge',
      text_excerpt: 'Reverse charge applies to goods acquired from EU suppliers. Customer self-accounts for VAT.',
      section_number: '56',
      statuteId: 'IE_VATA_2010',
      jurisdictionId: 'IE',
    });

    // UK VAT Post-Brexit
    await writeService.upsertSection({
      id: 'UK_VATA_1994_S7A',
      label: 'Section 7A',
      title: 'UK VAT on Imported Services',
      text_excerpt: 'Reverse charge on services from outside UK. Ireland treated as third country for UK VAT purposes.',
      section_number: '7A',
      statuteId: 'UK_VATA_1994',
      jurisdictionId: 'UK',
    });

    // --- Social Security / Posted Workers ---

    // Social Security for Cross-Border Workers (IE)
    await writeService.upsertSection({
      id: 'IE_SWCA_2005_POSTED',
      label: 'Part 14',
      title: 'Social Insurance - Posted Workers',
      text_excerpt: 'Employees posted to EU remain in Irish PRSI for up to 24 months (A1 certificate). EU Reg 883/2004.',
      section_number: 'Part 14',
      statuteId: 'IE_SW_CONS_ACT_2005',
      jurisdictionId: 'IE',
    });

    // A1 Certificate Duration
    await writeService.upsertSection({
      id: 'EU_REG_883_2004_ART12',
      label: 'Article 12',
      title: 'Posting of Workers (Social Security)',
      text_excerpt: 'Worker posted to another Member State remains subject to home State social security for up to 24 months.',
      section_number: '12',
      statuteId: 'EU_REG_883_2004',
      jurisdictionId: 'EU',
    });

    // Multi-State Workers
    await writeService.upsertSection({
      id: 'EU_REG_883_2004_ART13',
      label: 'Article 13',
      title: 'Multi-State Workers (Social Security)',
      text_excerpt: 'Worker active in 2+ States subject to State of residence if substantial activity (25%+) there.',
      section_number: '13',
      statuteId: 'EU_REG_883_2004',
      jurisdictionId: 'EU',
    });

    // UK Social Security Post-Brexit
    await writeService.upsertSection({
      id: 'UK_IE_SS_CONVENTION',
      label: 'UK-Ireland Social Security Convention',
      title: 'UK-Ireland Social Security Coordination',
      text_excerpt: 'Bilateral agreement preserving social security coordination post-Brexit. Covers PRSI/NI aggregation.',
      section_number: 'Convention',
      statuteId: 'TREATY_IE_UK_1976',
      jurisdictionId: 'IE',
    });

    // --- Transfer Pricing Specific ---

    // UK Transfer Pricing
    await writeService.upsertSection({
      id: 'UK_TIOPA_2010_S147',
      label: 'Part 4',
      title: 'UK Transfer Pricing',
      text_excerpt: 'UK transfer pricing rules for transactions between connected persons. OECD Guidelines apply.',
      section_number: '147-230',
      statuteId: 'UK_CTA_2010',
      jurisdictionId: 'UK',
    });

    log('   ✅ Created: 19 cross-border sections\n');

    // ==================================================================================
    // RELIEFS (Tax Reliefs Referenced in Conversations)
    // ==================================================================================
    log('💡 Creating tax reliefs...');

    await writeService.upsertRelief({
      id: 'IE_RELIEF_RND_CREDIT',
      name: 'R&D Tax Credit',
      tax_type: 'CORPORATION_TAX',
      short_summary: '25% tax credit for qualifying R&D expenditure',
      description: 'Corporation tax credit of 25% on qualifying R&D spend. Can offset against current and previous year CT liability, or claim 3-year refund if insufficient profits.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertRelief({
      id: 'IE_RELIEF_ENTREPRENEUR',
      name: 'Entrepreneur Relief',
      tax_type: 'CAPITAL_GAINS_TAX',
      short_summary: '10% CGT rate on qualifying business disposals, €1M lifetime limit',
      description: 'Reduced CGT rate of 10% (vs standard 33%) on disposal of qualifying business or farm assets. €1M lifetime limit. Must be working in business for 3+ years.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertRelief({
      id: 'IE_RELIEF_RETIREMENT',
      name: 'Retirement Relief',
      tax_type: 'CAPITAL_GAINS_TAX',
      short_summary: 'CGT exemption up to €750K on business disposal, age 55+',
      description: 'CGT exemption on business disposal: €750K if passing to family, €500K if sold to third party. Seller must be 55+ and own business for 10+ years.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertRelief({
      id: 'IE_RELIEF_KEEP',
      name: 'KEEP (Key Employee Engagement Programme)',
      tax_type: 'INCOME_TAX',
      short_summary: 'No income tax/USC/PRSI on share option exercise up to €300K over 3 years',
      description: 'Share option scheme with no income tax, USC, or PRSI on exercise. €300K limit over 3 years. CGT on sale. Must hold options 12+ months, shares 24+ months.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertRelief({
      id: 'IE_RELIEF_ESOS',
      name: 'ESOS (Employee Share Ownership Scheme)',
      tax_type: 'INCOME_TAX',
      short_summary: 'No income tax/USC on share grant up to €12,700/year',
      description: 'Share grant scheme with no income tax or USC at grant if shares held 3 years. €12,700/year limit. PRSI still applies. CGT on sale.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertRelief({
      id: 'IE_RELIEF_KDB',
      name: 'Knowledge Development Box',
      tax_type: 'CORPORATION_TAX',
      short_summary: 'Effective 6.25% CT rate on qualifying IP income',
      description: 'Reduced effective CT rate of 6.25% (50% of 12.5%) on income from qualifying IP assets: patents, software copyright, certain inventions. Must track R&D spend.',
      jurisdictionId: 'IE',
    });

    // Capital Allowances relief (DataTech HR - company car)
    await writeService.upsertRelief({
      id: 'IE_RELIEF_CAPITAL_ALLOWANCES',
      name: 'Capital Allowances (Plant & Machinery)',
      tax_type: 'CORPORATION_TAX',
      short_summary: '12.5% annual write-off for plant and machinery over 8 years',
      description: 'Wear and tear allowance of 12.5% per annum for qualifying plant and machinery. For motor vehicles, cost base capped at €24,000.',
      jurisdictionId: 'IE',
    });

    // Home Office relief (Seán's conversations)
    await writeService.upsertRelief({
      id: 'IE_RELIEF_REMOTE_WORKING',
      name: 'Remote Working Relief',
      tax_type: 'INCOME_TAX',
      short_summary: '€3.20/day flat rate or 30% broadband + 10% utilities',
      description: 'Remote workers can claim €3.20 per day (max 250 days = €800/year) tax-free, or 30% of broadband and 10% of heat/electricity based on days worked at home.',
      jurisdictionId: 'IE',
    });

    // BIK relief for EVs (DataTech HR - company car)
    await writeService.upsertRelief({
      id: 'IE_RELIEF_BIK_EV',
      name: 'Electric Vehicle BIK Exemption',
      tax_type: 'INCOME_TAX',
      short_summary: '0% BIK rate for qualifying electric vehicles up to €45,000 OMV',
      description: 'Electric vehicles with Original Market Value up to €45,000 qualify for 0% BIK rate. PHEVs (Plug-in Hybrids) at 8% for CO2 < 50g/km.',
      jurisdictionId: 'IE',
    });

    // VAT MOSS scheme (DataTech Finance - VAT on SaaS)
    await writeService.upsertRelief({
      id: 'IE_SCHEME_VAT_MOSS',
      name: 'VAT Mini One-Stop Shop (MOSS)',
      tax_type: 'VAT',
      short_summary: 'Single VAT registration for B2C digital services across EU',
      description: 'Allows businesses selling digital services to consumers across EU to register in one country and file single quarterly return. Consumer pays local VAT rate.',
      jurisdictionId: 'IE',
    });

    log('   ✅ Created: 10 tax reliefs\n');

    // ==================================================================================
    // BENEFITS (Social Welfare Benefits)
    // ==================================================================================
    log('💰 Creating social welfare benefits...');

    await writeService.upsertBenefit({
      id: 'IE_BENEFIT_MATERNITY',
      name: 'Maternity Benefit',
      category: 'MATERNITY',
      short_summary: '€274/week for 26 weeks maternity leave',
      description: 'Maternity benefit paid at €274/week for 26 weeks. Requires 52 weeks PRSI contributions in previous 2 years. Class A/E/H/S eligible.',
      jurisdictionId: 'IE',
    });

    log('   ✅ Created: Maternity Benefit\n');

    // ==================================================================================
    // TIMELINES (Time-based constraints)
    // ==================================================================================
    log('⏱️  Creating timeline constraints...');

    await writeService.upsertTimeline({
      id: 'IE_RND_4_YEAR_PERIOD',
      label: 'R&D 4-year accounting period',
      window_years: 4,
      kind: 'EFFECTIVE_WINDOW',
      jurisdictionCode: 'IE',
      description: 'R&D tax credit can be offset against CT liability over a 4-year accounting period',
    });

    await writeService.upsertTimeline({
      id: 'IE_RND_3_YEAR_REFUND',
      label: 'R&D 3-year refund window',
      window_years: 3,
      kind: 'LOOKBACK',
      jurisdictionCode: 'IE',
      description: 'R&D tax credit can be claimed as 3-year refund if insufficient CT liability',
    });

    await writeService.upsertTimeline({
      id: 'IE_KEEP_12_MONTH_OPTION',
      label: 'KEEP 12-month option holding',
      window_months: 12,
      kind: 'LOCK_IN',
      jurisdictionCode: 'IE',
      description: 'KEEP options must be held for at least 12 months before exercise',
    });

    await writeService.upsertTimeline({
      id: 'IE_KEEP_24_MONTH_SHARE',
      label: 'KEEP 24-month share holding',
      window_months: 24,
      kind: 'LOCK_IN',
      jurisdictionCode: 'IE',
      description: 'KEEP shares must be held for at least 24 months after exercise to qualify for relief',
    });

    await writeService.upsertTimeline({
      id: 'IE_ESOS_3_YEAR_HOLDING',
      label: 'ESOS 3-year holding period',
      window_years: 3,
      kind: 'LOCK_IN',
      jurisdictionCode: 'IE',
      description: 'ESOS shares must be held for 3 years to avoid income tax/USC charge',
    });

    await writeService.upsertTimeline({
      id: 'IE_ENTREPRENEUR_3_YEAR_WORK',
      label: 'Entrepreneur Relief 3-year working requirement',
      window_years: 3,
      kind: 'OTHER',
      jurisdictionCode: 'IE',
      description: 'Must be working in business for 3+ years before disposal to qualify for Entrepreneur Relief',
    });

    await writeService.upsertTimeline({
      id: 'IE_RETIREMENT_10_YEAR_OWNERSHIP',
      label: 'Retirement Relief 10-year ownership',
      window_years: 10,
      kind: 'OTHER',
      jurisdictionCode: 'IE',
      description: 'Must own business for 10+ years to qualify for Retirement Relief',
    });

    await writeService.upsertTimeline({
      id: 'IE_MATERNITY_52_WEEK_PRSI',
      label: 'Maternity 52-week PRSI requirement',
      window_months: 24,
      kind: 'LOOKBACK',
      jurisdictionCode: 'IE',
      description: 'Requires 52 weeks PRSI contributions in previous 2 years (24 months)',
    });

    // VAT registration timelines (Seán's VAT conversation)
    await writeService.upsertTimeline({
      id: 'IE_VAT_30_DAY_REGISTRATION',
      label: 'VAT 30-day registration window',
      window_days: 30,
      kind: 'DEADLINE',
      jurisdictionCode: 'IE',
      description: 'Must register for VAT within 30 days of exceeding threshold (€40K services, €80K goods)',
    });

    await writeService.upsertTimeline({
      id: 'IE_VAT_12_MONTH_THRESHOLD',
      label: 'VAT 12-month rolling threshold',
      window_months: 12,
      kind: 'LOOKBACK',
      jurisdictionCode: 'IE',
      description: 'VAT threshold calculated on continuous 12-month basis, not calendar year',
    });

    // BIK mileage periods (DataTech HR - company car)
    await writeService.upsertTimeline({
      id: 'IE_BIK_ANNUAL_MILEAGE',
      label: 'BIK Annual Mileage Period',
      window_years: 1,
      kind: 'OTHER',
      jurisdictionCode: 'IE',
      description: 'Business mileage for BIK reduction calculated over tax year. 24K+ km = 75%, 32K+ = 50%, 40K+ = 25%',
    });

    // Close company distribution deadline (DataTech Tax - close company)
    await writeService.upsertTimeline({
      id: 'IE_CLOSE_COMPANY_18_MONTH',
      label: 'Close Company 18-month distribution window',
      window_months: 18,
      kind: 'DEADLINE',
      jurisdictionCode: 'IE',
      description: 'Close company surcharge applies if investment/rental income not distributed within 18 months of accounting period end',
    });

    log('   ✅ Created: 12 timeline constraints\n');

    // ==================================================================================
    // PROFILE TAGS (User profiles referenced in conversations)
    // ==================================================================================
    log('👤 Creating profile tags...');

    await writeService.upsertProfileTag({
      id: 'PROFILE_SINGLE_DIRECTOR_IE',
      label: 'Single Director (Ireland)',
      category: 'EMPLOYMENT_STATUS',
      description: 'Single director of Irish limited company, pays Class S PRSI (4%), no PAYE withholding',
      jurisdictionId: 'IE',
    });

    await writeService.upsertProfileTag({
      id: 'PROFILE_LIMITED_COMPANY_IE',
      label: 'Limited Company (Ireland)',
      category: 'BUSINESS_STRUCTURE',
      description: 'Irish limited company subject to 12.5% CT on trading income, 25% on investment income',
      jurisdictionId: 'IE',
    });

    await writeService.upsertProfileTag({
      id: 'PROFILE_CLOSE_COMPANY_IE',
      label: 'Close Company (Ireland)',
      category: 'BUSINESS_STRUCTURE',
      description: 'Close company (5 or fewer participators control >50%). Subject to surcharge on undistributed investment/rental income.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertProfileTag({
      id: 'PROFILE_PAYE_EMPLOYEE_IE',
      label: 'PAYE Employee (Ireland)',
      category: 'EMPLOYMENT_STATUS',
      description: 'PAYE employee in Ireland paying Class A PRSI (4.1% employee + 11.05% employer)',
      jurisdictionId: 'IE',
    });

    await writeService.upsertProfileTag({
      id: 'PROFILE_COMPANY_DIRECTOR_IE',
      label: 'Company Director (Ireland)',
      category: 'EMPLOYMENT_STATUS',
      description: 'Company director receiving salary + dividends. Salary subject to PAYE/PRSI/USC, dividends to income tax only.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertProfileTag({
      id: 'PROFILE_KEY_EMPLOYEE_IE',
      label: 'Key Employee (Ireland)',
      category: 'EMPLOYMENT_STATUS',
      description: 'Employee eligible for share schemes (KEEP, ESOS). Typically senior employees or management.',
      jurisdictionId: 'IE',
    });

    // VAT-registered business (Seán's VAT conversation)
    await writeService.upsertProfileTag({
      id: 'PROFILE_VAT_REGISTERED_IE',
      label: 'VAT Registered Business (Ireland)',
      category: 'BUSINESS_STATUS',
      description: 'Business registered for Irish VAT. Must file bi-monthly or quarterly returns via ROS.',
      jurisdictionId: 'IE',
    });

    // Remote worker (Seán's home office conversation)
    await writeService.upsertProfileTag({
      id: 'PROFILE_REMOTE_WORKER_IE',
      label: 'Remote Worker (Ireland)',
      category: 'EMPLOYMENT_STATUS',
      description: 'Employee working from home. Eligible for €3.20/day flat rate or actual cost apportionment.',
      jurisdictionId: 'IE',
    });

    // Higher rate taxpayer (Seán's salary/dividend conversation)
    await writeService.upsertProfileTag({
      id: 'PROFILE_HIGHER_RATE_TAXPAYER_IE',
      label: 'Higher Rate Taxpayer (Ireland)',
      category: 'TAX_STATUS',
      description: 'Individual with income above €42,000 (single). Pays 40% income tax on income above cut-off.',
      jurisdictionId: 'IE',
    });

    // SaaS business (DataTech Finance - VAT on SaaS)
    await writeService.upsertProfileTag({
      id: 'PROFILE_SAAS_BUSINESS_IE',
      label: 'SaaS Business (Ireland)',
      category: 'BUSINESS_TYPE',
      description: 'Software-as-a-Service business. B2B: reverse charge, B2C: VAT MOSS with local consumer rates.',
      jurisdictionId: 'IE',
    });

    // Company with share scheme (DataTech HR - KEEP)
    await writeService.upsertProfileTag({
      id: 'PROFILE_SHARE_SCHEME_COMPANY_IE',
      label: 'Company with Share Scheme (Ireland)',
      category: 'BUSINESS_STATUS',
      description: 'Company operating KEEP or ESOS. Must be unquoted trading company with <€50M assets and <250 employees for KEEP.',
      jurisdictionId: 'IE',
    });

    log('   ✅ Created: 11 Irish profile tags\n');

    // ==================================================================================
    // CROSS-BORDER PROFILE TAGS
    // ==================================================================================
    log('🌍 Creating cross-border profile tags...');

    // MNE Group (subject to Pillar 2)
    await writeService.upsertProfileTag({
      id: 'PROFILE_MNE_GROUP',
      label: 'MNE Group (€750M+ Revenue)',
      category: 'BUSINESS_TYPE',
      description: 'Multinational enterprise group with €750M+ consolidated revenue. Subject to Pillar 2 minimum tax.',
      jurisdictionId: 'EU',
    });

    // Irish Holding Company
    await writeService.upsertProfileTag({
      id: 'PROFILE_HOLDING_COMPANY_IE',
      label: 'Irish Holding Company',
      category: 'BUSINESS_STRUCTURE',
      description: 'Irish company holding shares in EU/non-EU subsidiaries. Benefits from participation exemption on dividends.',
      jurisdictionId: 'IE',
    });

    // Cross-Border Worker IE-UK
    await writeService.upsertProfileTag({
      id: 'PROFILE_CROSS_BORDER_WORKER_IE_UK',
      label: 'Cross-Border Worker (IE-UK)',
      category: 'EMPLOYMENT_STATUS',
      description: 'Worker crossing IE/UK or IE/NI border. Subject to IE-UK tax treaty and bilateral SS convention.',
      jurisdictionId: 'IE',
    });

    // Posted Worker (EU)
    await writeService.upsertProfileTag({
      id: 'PROFILE_POSTED_WORKER_EU',
      label: 'Posted Worker (EU)',
      category: 'EMPLOYMENT_STATUS',
      description: 'Employee posted from IE to another EU State (or vice versa). A1 certificate for up to 24 months.',
      jurisdictionId: 'EU',
    });

    // Irish Company with US Operations
    await writeService.upsertProfileTag({
      id: 'PROFILE_IE_US_OPERATIONS',
      label: 'Irish Company with US Operations',
      category: 'BUSINESS_TYPE',
      description: 'Irish company with US subsidiary or PE. Subject to IE-US treaty, FDII considerations, GILTI.',
      jurisdictionId: 'IE',
    });

    // Irish IP Holding Company
    await writeService.upsertProfileTag({
      id: 'PROFILE_IP_HOLDING_IE',
      label: 'Irish IP Holding Company',
      category: 'BUSINESS_STRUCTURE',
      description: 'Irish company holding qualifying IP. KDB at 6.25% rate. Subject to BEPS substance requirements.',
      jurisdictionId: 'IE',
    });

    // UK Company with Irish PE
    await writeService.upsertProfileTag({
      id: 'PROFILE_UK_COMPANY_IE_PE',
      label: 'UK Company with Irish PE',
      category: 'BUSINESS_STRUCTURE',
      description: 'UK company with permanent establishment in Ireland. Irish branch profits taxed at 12.5%.',
      jurisdictionId: 'UK',
    });

    // EU Company with Irish Operations
    await writeService.upsertProfileTag({
      id: 'PROFILE_EU_COMPANY_IE_OPS',
      label: 'EU Company with Irish Operations',
      category: 'BUSINESS_STRUCTURE',
      description: 'Non-Irish EU company with Irish subsidiary or branch. Parent-Subsidiary Directive benefits.',
      jurisdictionId: 'EU',
    });

    // NI Cross-Border Trader
    await writeService.upsertProfileTag({
      id: 'PROFILE_NI_CROSS_BORDER_TRADER',
      label: 'NI Cross-Border Trader',
      category: 'BUSINESS_TYPE',
      description: 'Business trading across IE/NI border. Goods subject to NI Protocol (XI VAT prefix), services to UK rules.',
      jurisdictionId: 'NI',
    });

    log('   ✅ Created: 9 cross-border profile tags\n');

    // ==================================================================================
    // CROSS-BORDER TIMELINES
    // ==================================================================================
    log('⏱️  Creating cross-border timelines...');

    // Posted Worker 24 months (EU)
    await writeService.upsertTimeline({
      id: 'EU_POSTED_WORKER_24_MONTH',
      label: 'Posted Worker 24-month limit',
      window_months: 24,
      kind: 'EFFECTIVE_WINDOW',
      jurisdictionCode: 'EU',
      description: 'A1 certificate valid for up to 24 months. Extension requires agreement between Member States.',
    });

    // DAC6 30-day reporting
    await writeService.upsertTimeline({
      id: 'EU_DAC6_30_DAY_REPORTING',
      label: 'DAC6 30-day reporting deadline',
      window_days: 30,
      kind: 'DEADLINE',
      jurisdictionCode: 'EU',
      description: 'Cross-border arrangement must be reported within 30 days of implementation/availability.',
    });

    // Exit Tax 5-year deferral (IE)
    await writeService.upsertTimeline({
      id: 'IE_EXIT_TAX_5_YEAR_DEFERRAL',
      label: 'Exit Tax 5-year deferral (EU)',
      window_years: 5,
      kind: 'EFFECTIVE_WINDOW',
      jurisdictionCode: 'IE',
      description: 'Exit tax to EU/EEA can be deferred and paid over 5 years in equal installments.',
    });

    // Interest Limitation carryforward (IE)
    await writeService.upsertTimeline({
      id: 'IE_INTEREST_LIMITATION_5_YEAR',
      label: 'Interest Limitation 5-year carryforward',
      window_years: 5,
      kind: 'EFFECTIVE_WINDOW',
      jurisdictionCode: 'IE',
      description: 'Disallowed interest under ATAD can be carried forward for up to 5 years.',
    });

    // CFC 12-month accounting period
    await writeService.upsertTimeline({
      id: 'IE_CFC_12_MONTH_PERIOD',
      label: 'CFC 12-month accounting period',
      window_months: 12,
      kind: 'LOOKBACK',
      jurisdictionCode: 'IE',
      description: 'CFC charge calculated on 12-month accounting period of the CFC.',
    });

    log('   ✅ Created: 5 cross-border timelines\n');

    // ==================================================================================
    // RELATIONSHIPS (Connect the nodes)
    // ==================================================================================
    log('🔗 Creating relationships...');

    // Corporation Tax relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RND_CREDIT',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S766',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RND_CREDIT',
      fromLabel: 'Relief',
      toId: 'IE_RND_4_YEAR_PERIOD',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RND_CREDIT',
      fromLabel: 'Relief',
      toId: 'IE_RND_3_YEAR_REFUND',
      toLabel: 'Timeline',
      relType: 'LOOKBACK_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RND_CREDIT',
      fromLabel: 'Relief',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // Entrepreneur Relief relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ENTREPRENEUR',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S597',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ENTREPRENEUR',
      fromLabel: 'Relief',
      toId: 'IE_ENTREPRENEUR_3_YEAR_WORK',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ENTREPRENEUR',
      fromLabel: 'Relief',
      toId: 'PROFILE_SINGLE_DIRECTOR_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ENTREPRENEUR',
      fromLabel: 'Relief',
      toId: 'PROFILE_COMPANY_DIRECTOR_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // Retirement Relief relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RETIREMENT',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S598',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RETIREMENT',
      fromLabel: 'Relief',
      toId: 'IE_RETIREMENT_10_YEAR_OWNERSHIP',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RETIREMENT',
      fromLabel: 'Relief',
      toId: 'PROFILE_SINGLE_DIRECTOR_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RETIREMENT',
      fromLabel: 'Relief',
      toId: 'PROFILE_COMPANY_DIRECTOR_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // KEEP relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_KEEP',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S128E',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_KEEP',
      fromLabel: 'Relief',
      toId: 'IE_KEEP_12_MONTH_OPTION',
      toLabel: 'Timeline',
      relType: 'LOCKS_IN_FOR_PERIOD',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_KEEP',
      fromLabel: 'Relief',
      toId: 'IE_KEEP_24_MONTH_SHARE',
      toLabel: 'Timeline',
      relType: 'LOCKS_IN_FOR_PERIOD',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_KEEP',
      fromLabel: 'Relief',
      toId: 'PROFILE_KEY_EMPLOYEE_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // ESOS relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ESOS',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S519',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ESOS',
      fromLabel: 'Relief',
      toId: 'IE_ESOS_3_YEAR_HOLDING',
      toLabel: 'Timeline',
      relType: 'LOCKS_IN_FOR_PERIOD',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_ESOS',
      fromLabel: 'Relief',
      toId: 'PROFILE_KEY_EMPLOYEE_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // KDB relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_KDB',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S769I',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_KDB',
      fromLabel: 'Relief',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // Maternity Benefit relationships
    await writeService.createRelationship({
      fromId: 'IE_BENEFIT_MATERNITY',
      fromLabel: 'Benefit',
      toId: 'IE_SWCA_2005_S55',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_BENEFIT_MATERNITY',
      fromLabel: 'Benefit',
      toId: 'IE_MATERNITY_52_WEEK_PRSI',
      toLabel: 'Timeline',
      relType: 'LOOKBACK_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_BENEFIT_MATERNITY',
      fromLabel: 'Benefit',
      toId: 'PROFILE_PAYE_EMPLOYEE_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // Close Company relationships
    await writeService.createRelationship({
      fromId: 'PROFILE_CLOSE_COMPANY_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_TCA_1997_S440',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'PROFILE_CLOSE_COMPANY_IE',
      fromLabel: 'ProfileTag',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'PART_OF',
    });

    // Capital Allowances relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_CAPITAL_ALLOWANCES',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S284',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_CAPITAL_ALLOWANCES',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S380K',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_CAPITAL_ALLOWANCES',
      fromLabel: 'Relief',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // Remote Working Relief relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_REMOTE_WORKING',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S114',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_REMOTE_WORKING',
      fromLabel: 'Relief',
      toId: 'PROFILE_REMOTE_WORKER_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_REMOTE_WORKING',
      fromLabel: 'Relief',
      toId: 'PROFILE_PAYE_EMPLOYEE_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // BIK EV Relief relationships
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_BIK_EV',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S121',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_BIK_EV',
      fromLabel: 'Relief',
      toId: 'IE_BIK_ANNUAL_MILEAGE',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_BIK_EV',
      fromLabel: 'Relief',
      toId: 'PROFILE_PAYE_EMPLOYEE_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_BIK_EV',
      fromLabel: 'Relief',
      toId: 'PROFILE_COMPANY_DIRECTOR_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // VAT MOSS relationships
    await writeService.createRelationship({
      fromId: 'IE_SCHEME_VAT_MOSS',
      fromLabel: 'Relief',
      toId: 'IE_VATCA_2010_S46',
      toLabel: 'Section',
      relType: 'CITES',
    });

    await writeService.createRelationship({
      fromId: 'IE_SCHEME_VAT_MOSS',
      fromLabel: 'Relief',
      toId: 'PROFILE_SAAS_BUSINESS_IE',
      toLabel: 'ProfileTag',
      relType: 'APPLIES_TO_PROFILE',
    });

    // VAT Registration threshold relationships
    await writeService.createRelationship({
      fromId: 'IE_VATCA_2010_S65',
      fromLabel: 'Section',
      toId: 'IE_VAT_30_DAY_REGISTRATION',
      toLabel: 'Timeline',
      relType: 'FILING_DEADLINE',
    });

    await writeService.createRelationship({
      fromId: 'IE_VATCA_2010_S65',
      fromLabel: 'Section',
      toId: 'IE_VAT_12_MONTH_THRESHOLD',
      toLabel: 'Timeline',
      relType: 'LOOKBACK_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'PROFILE_VAT_REGISTERED_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_VATCA_2010_S65',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // Close Company surcharge relationships
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S440',
      fromLabel: 'Section',
      toId: 'IE_CLOSE_COMPANY_18_MONTH',
      toLabel: 'Timeline',
      relType: 'FILING_DEADLINE',
    });

    // Income Tax section relationships
    await writeService.createRelationship({
      fromId: 'PROFILE_HIGHER_RATE_TAXPAYER_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_TCA_1997_S16',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'PROFILE_PAYE_EMPLOYEE_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_TCA_1997_S15',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'PROFILE_PAYE_EMPLOYEE_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_SWCA_2005_S13',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // Share scheme company relationships
    await writeService.createRelationship({
      fromId: 'PROFILE_SHARE_SCHEME_COMPANY_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_RELIEF_KEEP',
      toLabel: 'Relief',
      relType: 'QUALIFIES_FOR',
    });

    await writeService.createRelationship({
      fromId: 'PROFILE_SHARE_SCHEME_COMPANY_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_RELIEF_ESOS',
      toLabel: 'Relief',
      relType: 'QUALIFIES_FOR',
    });

    // SaaS business profile relationships
    await writeService.createRelationship({
      fromId: 'PROFILE_SAAS_BUSINESS_IE',
      fromLabel: 'ProfileTag',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'PART_OF',
    });

    await writeService.createRelationship({
      fromId: 'PROFILE_SAAS_BUSINESS_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_RELIEF_RND_CREDIT',
      toLabel: 'Relief',
      relType: 'QUALIFIES_FOR',
    });

    log('   ✅ Created: ~55 Irish relationships\n');

    // ==================================================================================
    // CROSS-JURISDICTIONAL RELATIONSHIPS
    // ==================================================================================
    log('🌐 Creating cross-jurisdictional relationships...');

    // --- Irish Implementation of EU Directives ---

    // ATAD Interest Limitation implements EU Directive
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S835AAA',
      fromLabel: 'Section',
      toId: 'EU_DIR_2016_1164',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // ATAD Exit Tax implements EU Directive
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S627A',
      fromLabel: 'Section',
      toId: 'EU_DIR_2016_1164',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // ATAD CFC Rules implements EU Directive
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S835R',
      fromLabel: 'Section',
      toId: 'EU_DIR_2016_1164',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // Hybrid Mismatch implements ATAD II
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S835W',
      fromLabel: 'Section',
      toId: 'EU_DIR_2017_952',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // DAC6 Implementation
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S817RA',
      fromLabel: 'Section',
      toId: 'EU_DIR_2018_822',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // Pillar 2 Implementation
    await writeService.createRelationship({
      fromId: 'IE_FA_2023_PILLAR2',
      fromLabel: 'Section',
      toId: 'EU_DIR_2022_2523',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // Irish VAT implements EU VAT Directive
    await writeService.createRelationship({
      fromId: 'IE_VATA_2010',
      fromLabel: 'Statute',
      toId: 'EU_DIR_2006_112',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // Irish Posted Workers implements EU Regulation
    await writeService.createRelationship({
      fromId: 'IE_SWCA_2005_POSTED',
      fromLabel: 'Section',
      toId: 'EU_REG_883_2004',
      toLabel: 'Statute',
      relType: 'IMPLEMENTS',
    });

    // --- Tax Treaty Relationships ---

    // IE-UK Treaty applies to cross-border workers
    await writeService.createRelationship({
      fromId: 'PROFILE_CROSS_BORDER_WORKER_IE_UK',
      fromLabel: 'ProfileTag',
      toId: 'TREATY_IE_UK_1976',
      toLabel: 'Statute',
      relType: 'SUBJECT_TO_REGIME',
    });

    // IE-US Treaty applies to IE companies with US operations
    await writeService.createRelationship({
      fromId: 'PROFILE_IE_US_OPERATIONS',
      fromLabel: 'ProfileTag',
      toId: 'TREATY_IE_US_1997',
      toLabel: 'Statute',
      relType: 'SUBJECT_TO_REGIME',
    });

    // MLI modifies IE-UK Treaty
    await writeService.createRelationship({
      fromId: 'OECD_MLI_2017',
      fromLabel: 'Statute',
      toId: 'TREATY_IE_UK_1976',
      toLabel: 'Statute',
      relType: 'AMENDS',
    });

    // MLI modifies IE-DE Treaty
    await writeService.createRelationship({
      fromId: 'OECD_MLI_2017',
      fromLabel: 'Statute',
      toId: 'TREATY_IE_DE_2011',
      toLabel: 'Statute',
      relType: 'AMENDS',
    });

    // MLI modifies IE-NL Treaty
    await writeService.createRelationship({
      fromId: 'OECD_MLI_2017',
      fromLabel: 'Statute',
      toId: 'TREATY_IE_NL_1969',
      toLabel: 'Statute',
      relType: 'AMENDS',
    });

    // --- Cross-Border VAT Relationships ---

    // NI Protocol for goods
    await writeService.createRelationship({
      fromId: 'IE_VATCA_2010_NI_GOODS',
      fromLabel: 'Section',
      toId: 'UK_NI_PROTOCOL',
      toLabel: 'Statute',
      relType: 'CITES',
    });

    // NI Cross-Border Trader subject to NI Protocol
    await writeService.createRelationship({
      fromId: 'PROFILE_NI_CROSS_BORDER_TRADER',
      fromLabel: 'ProfileTag',
      toId: 'UK_NI_PROTOCOL',
      toLabel: 'Statute',
      relType: 'SUBJECT_TO_REGIME',
    });

    // NI Cross-Border Trader subject to IE VAT for goods
    await writeService.createRelationship({
      fromId: 'PROFILE_NI_CROSS_BORDER_TRADER',
      fromLabel: 'ProfileTag',
      toId: 'IE_VATCA_2010_NI_GOODS',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // UK VAT section references UK VATA
    await writeService.createRelationship({
      fromId: 'UK_VATA_1994_S7A',
      fromLabel: 'Section',
      toId: 'UK_VATA_1994',
      toLabel: 'Statute',
      relType: 'PART_OF',
    });

    // VAT MOSS relates to EU VAT Directive
    await writeService.createRelationship({
      fromId: 'IE_SCHEME_VAT_MOSS',
      fromLabel: 'Relief',
      toId: 'EU_DIR_2006_112',
      toLabel: 'Statute',
      relType: 'CITES',
    });

    // --- Social Security Coordination ---

    // Posted Worker profile subject to EU regulation
    await writeService.createRelationship({
      fromId: 'PROFILE_POSTED_WORKER_EU',
      fromLabel: 'ProfileTag',
      toId: 'EU_REG_883_2004',
      toLabel: 'Statute',
      relType: 'SUBJECT_TO_REGIME',
    });

    // Posted Worker timeline applies to profile
    await writeService.createRelationship({
      fromId: 'PROFILE_POSTED_WORKER_EU',
      fromLabel: 'ProfileTag',
      toId: 'EU_POSTED_WORKER_24_MONTH',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    // Cross-Border Worker IE-UK subject to bilateral convention
    await writeService.createRelationship({
      fromId: 'PROFILE_CROSS_BORDER_WORKER_IE_UK',
      fromLabel: 'ProfileTag',
      toId: 'UK_IE_SS_CONVENTION',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // EU Posted Workers Article applies to posted worker profile
    await writeService.createRelationship({
      fromId: 'EU_REG_883_2004_ART12',
      fromLabel: 'Section',
      toId: 'EU_POSTED_WORKER_24_MONTH',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    // --- MNE and Pillar 2 Relationships ---

    // MNE Group subject to Pillar 2
    await writeService.createRelationship({
      fromId: 'PROFILE_MNE_GROUP',
      fromLabel: 'ProfileTag',
      toId: 'IE_FA_2023_PILLAR2',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // MNE Group subject to EU Pillar 2 Directive
    await writeService.createRelationship({
      fromId: 'PROFILE_MNE_GROUP',
      fromLabel: 'ProfileTag',
      toId: 'EU_DIR_2022_2523',
      toLabel: 'Statute',
      relType: 'SUBJECT_TO_REGIME',
    });

    // --- Holding Company and Dividend Relationships ---

    // Irish Holding Company benefits from Parent-Subsidiary Directive
    await writeService.createRelationship({
      fromId: 'PROFILE_HOLDING_COMPANY_IE',
      fromLabel: 'ProfileTag',
      toId: 'EU_DIR_2011_96',
      toLabel: 'Statute',
      relType: 'QUALIFIES_FOR',
    });

    // EU Company with Irish Operations benefits from Parent-Subsidiary
    await writeService.createRelationship({
      fromId: 'PROFILE_EU_COMPANY_IE_OPS',
      fromLabel: 'ProfileTag',
      toId: 'EU_DIR_2011_96',
      toLabel: 'Statute',
      relType: 'QUALIFIES_FOR',
    });

    // Irish Holding Company is type of Limited Company
    await writeService.createRelationship({
      fromId: 'PROFILE_HOLDING_COMPANY_IE',
      fromLabel: 'ProfileTag',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'PART_OF',
    });

    // --- Transfer Pricing Relationships ---

    // Irish TP Rules subject to ATAD
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S835C',
      fromLabel: 'Section',
      toId: 'EU_DIR_2016_1164',
      toLabel: 'Statute',
      relType: 'CITES',
    });

    // UK TP Rules part of UK CTA
    await writeService.createRelationship({
      fromId: 'UK_TIOPA_2010_S147',
      fromLabel: 'Section',
      toId: 'UK_CTA_2010',
      toLabel: 'Statute',
      relType: 'PART_OF',
    });

    // MNE Group subject to Irish TP rules
    await writeService.createRelationship({
      fromId: 'PROFILE_MNE_GROUP',
      fromLabel: 'ProfileTag',
      toId: 'IE_TCA_1997_S835C',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // --- IP and KDB Relationships ---

    // IP Holding Company qualifies for KDB
    await writeService.createRelationship({
      fromId: 'PROFILE_IP_HOLDING_IE',
      fromLabel: 'ProfileTag',
      toId: 'IE_RELIEF_KDB',
      toLabel: 'Relief',
      relType: 'QUALIFIES_FOR',
    });

    // IP Holding Company is type of Limited Company
    await writeService.createRelationship({
      fromId: 'PROFILE_IP_HOLDING_IE',
      fromLabel: 'ProfileTag',
      toId: 'PROFILE_LIMITED_COMPANY_IE',
      toLabel: 'ProfileTag',
      relType: 'PART_OF',
    });

    // --- PE Relationships ---

    // UK Company with IE PE subject to Irish CT
    await writeService.createRelationship({
      fromId: 'PROFILE_UK_COMPANY_IE_PE',
      fromLabel: 'ProfileTag',
      toId: 'IE_TCA_1997_S25',
      toLabel: 'Section',
      relType: 'SUBJECT_TO_REGIME',
    });

    // UK Company with IE PE subject to IE-UK Treaty
    await writeService.createRelationship({
      fromId: 'PROFILE_UK_COMPANY_IE_PE',
      fromLabel: 'ProfileTag',
      toId: 'TREATY_IE_UK_1976',
      toLabel: 'Statute',
      relType: 'SUBJECT_TO_REGIME',
    });

    // --- Exit Tax and CFC Timeline Relationships ---

    // Exit Tax section has deferral timeline
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S627A',
      fromLabel: 'Section',
      toId: 'IE_EXIT_TAX_5_YEAR_DEFERRAL',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    // Interest Limitation has carryforward timeline
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S835AAA',
      fromLabel: 'Section',
      toId: 'IE_INTEREST_LIMITATION_5_YEAR',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    // CFC Rules have accounting period
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S835R',
      fromLabel: 'Section',
      toId: 'IE_CFC_12_MONTH_PERIOD',
      toLabel: 'Timeline',
      relType: 'LOOKBACK_WINDOW',
    });

    // DAC6 has reporting deadline
    await writeService.createRelationship({
      fromId: 'IE_TCA_1997_S817RA',
      fromLabel: 'Section',
      toId: 'EU_DAC6_30_DAY_REPORTING',
      toLabel: 'Timeline',
      relType: 'FILING_DEADLINE',
    });

    // --- Jurisdiction Hierarchy Relationships ---

    // NI is part of UK
    await writeService.createRelationship({
      fromId: 'NI',
      fromLabel: 'Jurisdiction',
      toId: 'UK',
      toLabel: 'Jurisdiction',
      relType: 'PART_OF',
    });

    // GB is part of UK
    await writeService.createRelationship({
      fromId: 'GB',
      fromLabel: 'Jurisdiction',
      toId: 'UK',
      toLabel: 'Jurisdiction',
      relType: 'PART_OF',
    });

    // IE is member of EU
    await writeService.createRelationship({
      fromId: 'IE',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    // DE is member of EU
    await writeService.createRelationship({
      fromId: 'DE',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    // FR is member of EU
    await writeService.createRelationship({
      fromId: 'FR',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    // NL is member of EU
    await writeService.createRelationship({
      fromId: 'NL',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    // CY is member of EU
    await writeService.createRelationship({
      fromId: 'CY',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    // MT is member of EU
    await writeService.createRelationship({
      fromId: 'MT',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    // LU is member of EU
    await writeService.createRelationship({
      fromId: 'LU',
      fromLabel: 'Jurisdiction',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'MEMBER_OF',
    });

    log('   ✅ Created: ~55 cross-jurisdictional relationships\n');

    // ==================================================================================
    // SUMMARY
    // ==================================================================================
    log('\n✅ Realistic graph seeding completed successfully!\n');
    log('📊 Summary:');
    log('   - Jurisdictions: 13 (IE, EU, UK, GB, NI, US, DE, FR, NL, CY, MT, LU, IM)');
    log('   - Statutes: 22 (Irish 3, EU Directives 9, UK 4, Tax Treaties 6)');
    log('   - Sections: 38 (19 Irish + 19 cross-border)');
    log('   - Reliefs: 10 (R&D, Entrepreneur, Retirement, KEEP, ESOS, KDB, Capital Allowances, Remote Working, BIK EV, VAT MOSS)');
    log('   - Benefits: 1 (Maternity)');
    log('   - Timeline constraints: 17 (12 Irish + 5 cross-border)');
    log('   - Profile tags: 20 (11 Irish + 9 cross-border)');
    log('   - Relationships: ~110 (55 Irish + 55 cross-jurisdictional)');
    log('\n🌍 Multi-Jurisdictional Coverage:');
    log('   🇮🇪 Ireland ↔ 🇪🇺 EU: ATAD, Parent-Subsidiary Directive, VAT Directive, Pillar 2, DAC6');
    log('   🇮🇪 Ireland ↔ 🇬🇧 UK: IE-UK DTA, Social Security Convention, Post-Brexit VAT, NI Protocol');
    log('   🇮🇪 Ireland ↔ 🇺🇸 US: IE-US DTA, Transfer Pricing, GILTI/FDII considerations');
    log('   🇮🇪 Ireland ↔ 🇩🇪 DE / 🇳🇱 NL / 🇨🇾 CY: Tax Treaties, MLI modifications');
    log('\n🎯 Node Alignment with Supabase Conversations:');
    log('   📁 DataTech Finance → Corporation Tax (S21), R&D Credit (S766), VAT (S65, S46, MOSS), Transfer Pricing (S835C)');
    log('   📁 DataTech HR → BIK (S121), KEEP (S128E), ESOS (S519), Maternity (S55), Posted Workers');
    log('   📁 DataTech Tax → Close Company (S440), Entrepreneur Relief (S597), Retirement Relief (S598), KDB (S769I), ATAD');
    log('   📁 Seán Personal → Income Tax (S15, S16), USC (S531AN), VAT Thresholds (S65), Remote Working (S114), PRSI (S13)');
    log('   📁 Cross-Border → EU Directives, Tax Treaties, NI Protocol, Social Security Coordination');
    log('✨ All writes enforced via Graph Ingress Guard ✨\n');

  } catch (error) {
    logError('❌ Error seeding graph:', error);
    if (error instanceof Error) {
      logError('   Message:', error.message);
      logError('   Stack:', error.stack);
    }
    throw error;
  } finally {
    await driver.close();
    log('🔌 Disconnected from Memgraph\n');
  }
}

// Run the seed
seedGraph(logger).catch((error) => {
  logError('💥 Seed failed:', error);
  process.exit(1);
});
