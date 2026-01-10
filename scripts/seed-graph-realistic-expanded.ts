#!/usr/bin/env tsx
/**
 * REALISTIC GRAPH SEED DATA - EXPANDED (Rates, Thresholds, Calculations)
 *
 * This script expands the realistic seed with granular regulatory nodes
 * for calculations: tax rates, BIK bands, thresholds, limits.
 *
 * Run AFTER seed-graph-realistic.ts or integrate into it.
 *
 * Adds:
 * - Tax rates (CT, VAT, PAYE, PRSI, USC, CGT, BIK)
 * - Thresholds (VAT registration, share scheme limits, age requirements)
 * - Relationships linking rates/thresholds to parent reliefs/sections
 *
 * Run: pnpm seed:graph:realistic:expanded
 */

import { loadEnv } from './load-env.js';
import neo4j, { Driver } from 'neo4j-driver';
import pino from 'pino';

// Load environment variables from .env.local or .env
loadEnv();

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
    maxConnectionLifetime: 3 * 60 * 60 * 1000,
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000,
  });
}

function log(...args: unknown[]) {
  logger.info(args.join(' '));
}

function logError(...args: unknown[]) {
  logger.error(args.join(' '));
}

async function seedExpandedData(driver: Driver) {
  const session = driver.session();

  try {
    log('\n🌱 Starting realistic graph seed expansion...\n');

    // ==================================================================================
    // TAX RATES
    // ==================================================================================
    log('💰 Creating tax rates...');

    // Corporation Tax Rates
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_CT_TRADING',
        label: '12.5% Corporation Tax (Trading)',
        percentage: 12.5,
        tax_type: 'CORPORATION_TAX',
        applies_to: 'trading_income',
        jurisdiction_id: 'IE',
        effective_from: date('2003-01-01'),
        effective_to: NULL,
        notes: 'Standard rate for trading income of Irish resident companies'
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_CT_INVESTMENT',
        label: '25% Corporation Tax (Investment)',
        percentage: 25.0,
        tax_type: 'CORPORATION_TAX',
        applies_to: 'investment_income',
        jurisdiction_id: 'IE',
        effective_from: date('2003-01-01'),
        effective_to: NULL,
        notes: 'Rate for rental and investment income'
      })
    `);

    // R&D Credit Rate
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_RND_CREDIT',
        label: '25% R&D Tax Credit',
        percentage: 25.0,
        tax_type: 'CORPORATION_TAX',
        applies_to: 'qualifying_rnd_expenditure',
        jurisdiction_id: 'IE',
        effective_from: date('2004-01-01'),
        effective_to: NULL,
        notes: 'Credit rate on qualifying R&D expenditure'
      })
    `);

    // Close Company Surcharge
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_CLOSE_COMPANY_SURCHARGE',
        label: '20% Close Company Surcharge',
        percentage: 20.0,
        tax_type: 'CORPORATION_TAX',
        applies_to: 'undistributed_investment_rental_income',
        jurisdiction_id: 'IE',
        effective_from: date('2014-01-01'),
        effective_to: NULL,
        notes: 'Surcharge on undistributed investment/rental income for close companies'
      })
    `);

    // Knowledge Development Box
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_KDB',
        label: '6.25% KDB Effective Rate',
        percentage: 6.25,
        tax_type: 'CORPORATION_TAX',
        applies_to: 'qualifying_ip_income',
        jurisdiction_id: 'IE',
        effective_from: date('2016-01-01'),
        effective_to: NULL,
        notes: 'Effective CT rate on qualifying IP income (50% of 12.5%)'
      })
    `);

    log('   Created CT rates (12.5%, 25%, R&D 25%, Surcharge 20%, KDB 6.25%)');

    // Capital Gains Tax Rates
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_CGT_STANDARD',
        label: '33% CGT Standard Rate',
        percentage: 33.0,
        tax_type: 'CAPITAL_GAINS_TAX',
        applies_to: 'standard_gains',
        jurisdiction_id: 'IE',
        effective_from: date('2012-12-06'),
        effective_to: NULL,
        notes: 'Standard CGT rate'
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_ENTREPRENEUR_RELIEF',
        label: '10% Entrepreneur Relief Rate',
        percentage: 10.0,
        tax_type: 'CAPITAL_GAINS_TAX',
        applies_to: 'qualifying_business_disposal',
        jurisdiction_id: 'IE',
        effective_from: date('2014-01-01'),
        effective_to: NULL,
        notes: 'Reduced CGT rate for qualifying business disposals'
      })
    `);

    log('   Created CGT rates (33% standard, 10% Entrepreneur Relief)');

    // VAT Rates
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_VAT_STANDARD',
        label: '23% VAT Standard Rate',
        percentage: 23.0,
        tax_type: 'VAT',
        applies_to: 'most_goods_services',
        jurisdiction_id: 'IE',
        effective_from: date('2012-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_VAT_REDUCED_1',
        label: '13.5% VAT Reduced Rate',
        percentage: 13.5,
        tax_type: 'VAT',
        applies_to: 'tourism_construction_services',
        jurisdiction_id: 'IE',
        effective_from: date('2003-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_VAT_REDUCED_2',
        label: '9% VAT Reduced Rate',
        percentage: 9.0,
        tax_type: 'VAT',
        applies_to: 'newspapers_sporting_facilities',
        jurisdiction_id: 'IE',
        effective_from: date('2011-07-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_VAT_LIVESTOCK',
        label: '4.8% VAT Livestock Rate',
        percentage: 4.8,
        tax_type: 'VAT',
        applies_to: 'livestock_greyhounds',
        jurisdiction_id: 'IE',
        effective_from: date('1996-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_VAT_ZERO',
        label: '0% VAT Zero Rate',
        percentage: 0.0,
        tax_type: 'VAT',
        applies_to: 'exports_intra_eu_supplies',
        jurisdiction_id: 'IE',
        effective_from: date('1972-01-01'),
        effective_to: NULL
      })
    `);

    log('   Created VAT rates (23%, 13.5%, 9%, 4.8%, 0%)');

    // PAYE Rates
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_PAYE_STANDARD',
        label: '20% PAYE Standard Rate',
        percentage: 20.0,
        tax_type: 'PAYE',
        threshold_single: 42000,
        threshold_married_one: 42000,
        threshold_married_two: 84000,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL,
        notes: 'Applies to income up to threshold'
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_PAYE_HIGHER',
        label: '40% PAYE Higher Rate',
        percentage: 40.0,
        tax_type: 'PAYE',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL,
        notes: 'Applies to income above threshold'
      })
    `);

    log('   Created PAYE rates (20% standard, 40% higher)');

    // PRSI Rates (Class A - employees)
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_PRSI_EMPLOYEE_A',
        label: '4.1% PRSI Employee (Class A)',
        percentage: 4.1,
        tax_type: 'PRSI',
        prsi_class: 'A',
        rate_type: 'employee',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_PRSI_EMPLOYER_A',
        label: '11.05% PRSI Employer (Class A)',
        percentage: 11.05,
        tax_type: 'PRSI',
        prsi_class: 'A',
        rate_type: 'employer',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    // PRSI Class S (self-employed/directors)
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_PRSI_SELF_EMPLOYED_S',
        label: '4% PRSI Class S (Self-Employed)',
        percentage: 4.0,
        tax_type: 'PRSI',
        prsi_class: 'S',
        rate_type: 'self_employed',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    log('   Created PRSI rates (4.1% employee, 11.05% employer, 4% Class S)');

    // USC Rates (4 bands)
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_USC_BAND_1',
        label: '0.5% USC Band 1',
        percentage: 0.5,
        tax_type: 'USC',
        band_number: 1,
        threshold_min: 0,
        threshold_max: 12012,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_USC_BAND_2',
        label: '2% USC Band 2',
        percentage: 2.0,
        tax_type: 'USC',
        band_number: 2,
        threshold_min: 12013,
        threshold_max: 25760,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_USC_BAND_3',
        label: '4.5% USC Band 3',
        percentage: 4.5,
        tax_type: 'USC',
        band_number: 3,
        threshold_min: 25761,
        threshold_max: 70044,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_USC_BAND_4',
        label: '8% USC Band 4',
        percentage: 8.0,
        tax_type: 'USC',
        band_number: 4,
        threshold_min: 70045,
        threshold_max: NULL,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    log('   Created USC rates (0.5%, 2%, 4.5%, 8%)');

    // BIK Rates by CO2 Emissions
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_BIK_EV',
        label: '0% BIK (Pure EV)',
        percentage: 0.0,
        tax_type: 'BIK',
        co2_emissions_min: 0,
        co2_emissions_max: 0,
        vehicle_type: 'EV',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL,
        notes: 'Pure electric vehicles'
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_BIK_PHEV',
        label: '8% BIK (PHEV 1-50g)',
        percentage: 8.0,
        tax_type: 'BIK',
        co2_emissions_min: 1,
        co2_emissions_max: 50,
        vehicle_type: 'PHEV',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL,
        notes: 'Plug-in hybrid electric vehicles'
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_BIK_LOW',
        label: '14% BIK (51-100g)',
        percentage: 14.0,
        tax_type: 'BIK',
        co2_emissions_min: 51,
        co2_emissions_max: 100,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_BIK_MID',
        label: '23% BIK (101-150g)',
        percentage: 23.0,
        tax_type: 'BIK',
        co2_emissions_min: 101,
        co2_emissions_max: 150,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_BIK_HIGH',
        label: '30% BIK (151-190g)',
        percentage: 30.0,
        tax_type: 'BIK',
        co2_emissions_min: 151,
        co2_emissions_max: 190,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_BIK_VERY_HIGH',
        label: '36% BIK (191g+)',
        percentage: 36.0,
        tax_type: 'BIK',
        co2_emissions_min: 191,
        co2_emissions_max: NULL,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    log('   Created BIK rates (0% EV, 8% PHEV, 14%, 23%, 30%, 36%)');

    // Maternity Benefit Rate
    await session.run(`
      CREATE (r:Rate {
        id: 'IE_RATE_MATERNITY_BENEFIT',
        label: '€274/week Maternity Benefit',
        amount_euro: 274.00,
        period: 'weekly',
        tax_type: 'BENEFIT',
        benefit_type: 'MATERNITY',
        weeks_payable: 26,
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL
      })
    `);

    log('   Created Maternity Benefit rate (€274/week)');

    // ==================================================================================
    // THRESHOLDS
    // ==================================================================================
    log('\n📏 Creating thresholds...');

    // VAT Registration Thresholds
    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_VAT_SERVICES',
        label: '€40,000 VAT Services Threshold',
        amount_euro: 40000.00,
        threshold_type: 'vat_registration',
        applies_to: 'services',
        direction: 'ABOVE',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL,
        notes: 'Mandatory VAT registration above this turnover for services'
      })
    `);

    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_VAT_GOODS',
        label: '€80,000 VAT Goods Threshold',
        amount_euro: 80000.00,
        threshold_type: 'vat_registration',
        applies_to: 'goods',
        direction: 'ABOVE',
        jurisdiction_id: 'IE',
        effective_from: date('2024-01-01'),
        effective_to: NULL,
        notes: 'Mandatory VAT registration above this turnover for goods'
      })
    `);

    log('   Created VAT thresholds (€40K services, €80K goods)');

    // Share Scheme Limits
    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_KEEP_LIMIT',
        label: '€300,000 KEEP 3-Year Limit',
        amount_euro: 300000.00,
        threshold_type: 'share_scheme_limit',
        period_years: 3,
        direction: 'BELOW',
        jurisdiction_id: 'IE',
        effective_from: date('2018-01-01'),
        effective_to: NULL,
        notes: 'Maximum value of shares under KEEP over 3 years'
      })
    `);

    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_ESOS_LIMIT',
        label: '€12,700 ESOS Annual Limit',
        amount_euro: 12700.00,
        threshold_type: 'share_scheme_limit',
        period_type: 'annual',
        direction: 'BELOW',
        jurisdiction_id: 'IE',
        effective_from: date('2001-01-01'),
        effective_to: NULL,
        notes: 'Maximum value of shares under ESOS per year'
      })
    `);

    log('   Created share scheme limits (€300K KEEP, €12,700 ESOS)');

    // CGT Relief Limits
    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_ENTREPRENEUR_LIFETIME',
        label: '€1,000,000 Entrepreneur Relief Lifetime Limit',
        amount_euro: 1000000.00,
        threshold_type: 'cgt_relief_limit',
        period_type: 'lifetime',
        direction: 'BELOW',
        jurisdiction_id: 'IE',
        effective_from: date('2014-01-01'),
        effective_to: NULL,
        notes: 'Lifetime limit for Entrepreneur Relief'
      })
    `);

    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_RETIREMENT_FAMILY',
        label: '€750,000 Retirement Relief (Family)',
        amount_euro: 750000.00,
        threshold_type: 'cgt_relief_limit',
        transfer_type: 'family',
        direction: 'BELOW',
        jurisdiction_id: 'IE',
        effective_from: date('2014-01-01'),
        effective_to: NULL,
        notes: 'Exemption limit when passing business to family'
      })
    `);

    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_RETIREMENT_THIRD_PARTY',
        label: '€500,000 Retirement Relief (Third Party)',
        amount_euro: 500000.00,
        threshold_type: 'cgt_relief_limit',
        transfer_type: 'third_party',
        direction: 'BELOW',
        jurisdiction_id: 'IE',
        effective_from: date('2014-01-01'),
        effective_to: NULL,
        notes: 'Exemption limit when selling business to third party'
      })
    `);

    // Age Requirement for Retirement Relief
    await session.run(`
      CREATE (t:Threshold {
        id: 'IE_THRESHOLD_RETIREMENT_AGE',
        label: 'Age 55+ for Retirement Relief',
        minimum_age: 55,
        threshold_type: 'age',
        direction: 'ABOVE',
        jurisdiction_id: 'IE',
        effective_from: date('2014-01-01'),
        effective_to: NULL,
        notes: 'Must be 55 or older to qualify'
      })
    `);

    log('   Created CGT relief thresholds (€1M Entrepreneur, €750K/€500K Retirement, age 55)');

    // ==================================================================================
    // RELATIONSHIPS
    // ==================================================================================
    log('\n🔗 Creating relationships to link rates & thresholds...');

    // Link rates to reliefs
    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_RND_CREDIT'})
      MATCH (rate:Rate {id: 'IE_RATE_RND_CREDIT'})
      CREATE (relief)-[:HAS_RATE]->(rate)
    `);

    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_ENTREPRENEUR'})
      MATCH (rate:Rate {id: 'IE_RATE_ENTREPRENEUR_RELIEF'})
      CREATE (relief)-[:HAS_RATE]->(rate)
    `);

    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_KDB'})
      MATCH (rate:Rate {id: 'IE_RATE_KDB'})
      CREATE (relief)-[:HAS_RATE]->(rate)
    `);

    await session.run(`
      MATCH (section:Section {id: 'IE_TCA_1997_S440'})
      MATCH (rate:Rate {id: 'IE_RATE_CLOSE_COMPANY_SURCHARGE'})
      CREATE (section)-[:HAS_RATE]->(rate)
    `);

    await session.run(`
      MATCH (benefit:Benefit {id: 'IE_BENEFIT_MATERNITY'})
      MATCH (rate:Rate {id: 'IE_RATE_MATERNITY_BENEFIT'})
      CREATE (benefit)-[:HAS_RATE]->(rate)
    `);

    log('   Linked rates to reliefs/sections/benefits');

    // Link thresholds to reliefs
    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_KEEP'})
      MATCH (threshold:Threshold {id: 'IE_THRESHOLD_KEEP_LIMIT'})
      CREATE (relief)-[:HAS_LIMIT]->(threshold)
    `);

    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_ESOS'})
      MATCH (threshold:Threshold {id: 'IE_THRESHOLD_ESOS_LIMIT'})
      CREATE (relief)-[:HAS_LIMIT]->(threshold)
    `);

    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_ENTREPRENEUR'})
      MATCH (threshold:Threshold {id: 'IE_THRESHOLD_ENTREPRENEUR_LIFETIME'})
      CREATE (relief)-[:HAS_LIMIT]->(threshold)
    `);

    await session.run(`
      MATCH (relief:Relief {id: 'IE_RELIEF_RETIREMENT'})
      MATCH (threshold_family:Threshold {id: 'IE_THRESHOLD_RETIREMENT_FAMILY'})
      MATCH (threshold_third:Threshold {id: 'IE_THRESHOLD_RETIREMENT_THIRD_PARTY'})
      MATCH (age:Threshold {id: 'IE_THRESHOLD_RETIREMENT_AGE'})
      CREATE (relief)-[:HAS_LIMIT]->(threshold_family)
      CREATE (relief)-[:HAS_LIMIT]->(threshold_third)
      CREATE (relief)-[:REQUIRES]->(age)
    `);

    log('   Linked thresholds to reliefs');

    // Link VAT thresholds to section
    await session.run(`
      MATCH (section:Section {id: 'IE_VATCA_2010_S65'})
      MATCH (services:Threshold {id: 'IE_THRESHOLD_VAT_SERVICES'})
      MATCH (goods:Threshold {id: 'IE_THRESHOLD_VAT_GOODS'})
      CREATE (services)-[:GOVERNED_BY]->(section)
      CREATE (goods)-[:GOVERNED_BY]->(section)
    `);

    log('   Linked VAT thresholds to Section 65');

    // Link rates to sections
    await session.run(`
      MATCH (section:Section {id: 'IE_TCA_1997_S21'})
      MATCH (rate:Rate {id: 'IE_RATE_CT_TRADING'})
      CREATE (section)-[:HAS_RATE]->(rate)
    `);

    log('   Linked CT rate to Section 21');

    log('\n✅ Realistic graph seed expansion completed successfully!\n');
    log('📊 Expansion Summary:');
    log('   - Rates: 28 (CT, VAT, PAYE, PRSI, USC, CGT, BIK)');
    log('   - Thresholds: 8 (VAT, share schemes, CGT reliefs, age)');
    log('   - Relationships: ~15 (HAS_RATE, HAS_LIMIT, REQUIRES, GOVERNED_BY)');
    log('\n🎯 Graph now supports accurate regulatory calculations');
    log('✨ All data aligned with Supabase conversation seed data\n');

  } catch (error) {
    logError('❌ Error seeding expanded data:', error);
    if (error instanceof Error) {
      logError('   Message:', error.message);
      logError('   Stack:', error.stack);
    }
    throw error;
  } finally {
    await session.close();
  }
}

// Run the expansion seed
(async () => {
  const driver = createDriver();

  try {
    await seedExpandedData(driver);
  } catch (error) {
    logError('💥 Expansion seed failed:', error);
    process.exit(1);
  } finally {
    await driver.close();
    log('🔌 Disconnected from Memgraph\n');
  }
})();
