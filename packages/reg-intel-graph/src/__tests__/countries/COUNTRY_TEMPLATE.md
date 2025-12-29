# Country-Specific Test Template

This template guides the creation of comprehensive country-specific integration tests for the regulatory graph.

## Directory Structure

```
src/__tests__/countries/{country_code}/
├── README.md                           # Country-specific test documentation
├── {country}.tax.test.ts              # Tax system tests
├── {country}.social_insurance.test.ts # Social insurance/security tests
├── {country}.compliance.test.ts       # Compliance obligations and forms
├── {country}.realworld.test.ts        # End-to-end scenario tests
└── {country}.crossborder.test.ts      # Cross-border coordination (optional)
```

## Test File Templates

### 1. Tax System Tests (`{country}.tax.test.ts`)

Test all country-specific tax rules:

```typescript
/**
 * {Country} Tax Integration Tests
 *
 * Real-world integration tests for {Country} tax system including:
 * - Income tax bands and rates
 * - Capital gains tax
 * - Corporate tax
 * - VAT/Sales tax
 * - Tax thresholds and exemptions
 * - Tax year transitions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBoltGraphClient } from '../../../boltGraphClient.js';
import type { BoltGraphClient } from '../../../boltGraphClient.js';

const TEST_CONFIG = {
  uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  username: process.env.MEMGRAPH_USERNAME || '',
  password: process.env.MEMGRAPH_PASSWORD || '',
  database: process.env.MEMGRAPH_DATABASE || 'memgraph',
};

describe('{Country} Tax System - Income Tax', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Income Tax Bands and Rates', () => {
    it('should have correct tax bands for {year}', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate)-[:IN_JURISDICTION]->(j:Jurisdiction {id: '{COUNTRY_CODE}'})
         WHERE r.category = 'INCOME_TAX' AND r.id CONTAINS '{YEAR}'
         RETURN r.percentage as rate, r.band_lower as lower, r.band_upper as upper
         ORDER BY r.band_lower`,
        {}
      );

      // Validate against official government tax rates
      expect(result.length).toBeGreaterThan(0);
    });

    it('should calculate tax correctly for typical income', async () => {
      // Test with real-world income example
      const income = 50000;
      // Add calculation logic
    });
  });

  describe('Capital Gains Tax', () => {
    it('should have CGT rate and exemptions', async () => {
      // Test CGT rates and thresholds
    });
  });

  // Add more tax-specific tests
});
```

**Key Tests to Include:**
- [ ] All income tax bands with accurate rates
- [ ] Capital gains tax rates and exemptions
- [ ] Corporate tax rates (if applicable)
- [ ] VAT/Sales tax rates
- [ ] Tax thresholds and allowances
- [ ] Temporal validity (effective dates)
- [ ] Real-world tax calculations
- [ ] Tax year transitions
- [ ] Special regimes (e.g., entrepreneur relief, R&D credits)

### 2. Social Insurance Tests (`{country}.social_insurance.test.ts`)

Test social security/insurance contributions and benefits:

```typescript
/**
 * {Country} Social Insurance Integration Tests
 *
 * Tests for social insurance/security system including:
 * - Contribution classes/categories
 * - Contribution rates and ceilings
 * - Benefit entitlements
 * - Qualifying conditions
 * - Life event triggers
 */

describe('{Country} Social Insurance - Contribution Classes', () => {
  // Test each contribution class
  it('should have {class} for {category} workers', async () => {
    // Validate contribution class properties
  });

  it('should define benefits entitled by {class}', async () => {
    // Test benefit entitlements
  });

  it('should link {class} to {profile} profiles', async () => {
    // Test profile relationships
  });
});

describe('Benefit Eligibility Chains', () => {
  it('should trace Profile → Class → Benefit path', async () => {
    // End-to-end eligibility validation
  });
});
```

**Key Tests to Include:**
- [ ] All contribution classes/categories
- [ ] Contribution rates (employee, employer, self-employed)
- [ ] Contribution ceilings/thresholds
- [ ] Benefit entitlements per class
- [ ] Qualifying periods and conditions
- [ ] Life event → Benefit triggering
- [ ] Differential entitlements between classes
- [ ] Cross-border coordination rules

### 3. Compliance Tests (`{country}.compliance.test.ts`)

Test filing obligations, forms, and deadlines:

```typescript
/**
 * {Country} Compliance Workflow Integration Tests
 *
 * Tests for compliance obligations including:
 * - Filing obligations
 * - Payment obligations
 * - Form requirements
 * - Deadlines and timelines
 * - Penalty conditions
 */

describe('{Country} Compliance - Filing Obligations', () => {
  it('should have {obligation} for {profile}', async () => {
    // Test obligation existence and properties
  });

  it('should require {form} for {obligation}', async () => {
    // Test form requirements
  });

  it('should have {deadline} for {obligation}', async () => {
    // Test timeline constraints
  });
});

describe('Complete Compliance Workflows', () => {
  it('should trace Profile → Obligation → Form → Timeline', async () => {
    // End-to-end compliance path
  });
});
```

**Key Tests to Include:**
- [ ] All filing obligations by profile type
- [ ] Payment obligations
- [ ] Required forms with metadata
- [ ] Deadlines and timelines
- [ ] Penalty conditions
- [ ] Complete compliance workflows
- [ ] Annual compliance calendars
- [ ] Profile-specific obligations
- [ ] Multi-jurisdiction filing (if applicable)

### 4. Real-World Scenarios (`{country}.realworld.test.ts`)

Test complete user journeys:

```typescript
/**
 * {Country} Real-World Scenario Integration Tests
 *
 * End-to-end tests simulating real user journeys through regulatory system.
 */

describe('{Country} Real-World Scenarios', () => {
  describe('Scenario 1: {Scenario Name}', () => {
    it('should identify complete requirements', async () => {
      // Test multi-step journey
    });

    it('should calculate financial impact', async () => {
      // Calculate taxes, benefits, costs
    });
  });
});
```

**Example Scenarios:**
- [ ] New business formation (sole trader, company)
- [ ] Employment status changes (employee → self-employed)
- [ ] Unemployment claim process
- [ ] Maternity/paternity leave
- [ ] Retirement planning
- [ ] Property transactions
- [ ] Cross-border worker scenarios
- [ ] Life event sequences (birth, marriage, etc.)

### 5. Cross-Border Tests (Optional: `{country}.crossborder.test.ts`)

Test international coordination:

```typescript
/**
 * {Country} Cross-Border Integration Tests
 *
 * Tests for cross-border coordination including:
 * - Treaties and agreements
 * - Social security coordination
 * - Tax treaties
 * - Benefit portability
 */

describe('{Country} Cross-Border Coordination', () => {
  it('should support {treaty} with {other_country}', async () => {
    // Test treaty relationships
  });
});
```

**Key Tests to Include:**
- [ ] Bilateral treaties
- [ ] Regional agreements (e.g., EU, CTA)
- [ ] Social security coordination
- [ ] Tax treaties
- [ ] Benefit portability
- [ ] Double taxation relief

## Data Sources Checklist

Document all authoritative sources:

- [ ] **Tax Authority**: Official tax rates and thresholds
- [ ] **Social Security Agency**: Contribution rates and benefits
- [ ] **Government Portal**: Regulations and forms
- [ ] **Legislative Database**: Statutory instruments
- [ ] **Official Forms Repository**: Form metadata and URLs

**Example:**
```typescript
it('should apply 2024 income tax rates', async () => {
  // Source: https://www.{country_tax_authority}.gov/{path}/tax-rates-2024
  // Standard rate: 20%, Higher rate: 40%
  // Retrieved: 2024-12-29

  const result = await client.executeCypher(/* ... */);
  expect(result.standardRate).toBe(20);
});
```

## Country-Specific Features Checklist

Identify and test unique regulatory features:

- [ ] **Tax System Uniqueness**: Progressive vs flat, number of bands, rates
- [ ] **Social Insurance Model**: Beveridge vs Bismarck, contribution structure
- [ ] **Compliance Regime**: Self-assessment vs employer withholding
- [ ] **Benefit System**: Universal vs contributory
- [ ] **Cross-Border Rules**: EU member, bilateral agreements, special zones
- [ ] **Administrative Bodies**: Tax authority, social security agency, registrars
- [ ] **Digital Services**: Online filing, digital forms, APIs

## Test Coverage Goals

Aim for comprehensive coverage:

| Category | Minimum Tests | Target Tests |
|----------|--------------|--------------|
| Tax System | 40+ | 60+ |
| Social Insurance | 50+ | 80+ |
| Compliance | 40+ | 70+ |
| Real-World Scenarios | 30+ | 50+ |
| Cross-Border | 10+ | 20+ |
| **Total** | **170+** | **280+** |

## Implementation Steps

1. **Research Phase**
   - [ ] Identify authoritative government sources
   - [ ] Document current tax rates and thresholds
   - [ ] List all social insurance classes
   - [ ] Catalog filing obligations and forms
   - [ ] Identify unique regulatory features

2. **Seed Data Creation**
   - [ ] Create seed data files in `src/seeds/{country}/`
   - [ ] Add jurisdictions, rates, thresholds
   - [ ] Add social insurance classes
   - [ ] Add obligations and forms
   - [ ] Add life events

3. **Test Development**
   - [ ] Create test directory structure
   - [ ] Implement tax tests
   - [ ] Implement social insurance tests
   - [ ] Implement compliance tests
   - [ ] Implement real-world scenarios
   - [ ] Add cross-border tests (if applicable)

4. **Documentation**
   - [ ] Create country-specific README
   - [ ] Document data sources
   - [ ] Add examples and patterns
   - [ ] Update main TEST_README.md

5. **Validation**
   - [ ] Run all tests with database
   - [ ] Verify calculations against official examples
   - [ ] Cross-reference with legislation
   - [ ] Peer review by country expert

## Example Countries to Implement

Priority list for additional country tests:

### High Priority
- **United Kingdom (UK)**: National Insurance, Income Tax, PAYE, VAT
- **Northern Ireland (NI)**: Special regime, dual regulations
- **European Union (EU)**: Directives, regulations, coordination

### Medium Priority
- **Germany**: Social insurance pillars, tax classes
- **France**: Complex social security system
- **Netherlands**: 30% ruling, box system
- **Spain**: Autonomous community variations

### Lower Priority
- **United States**: Federal + state tax, Social Security
- **Canada**: Federal + provincial, CPP/QPP
- **Australia**: Superannuation, PAYG

## Quality Standards

All country tests must meet these standards:

✅ **Accuracy**: Validate against official government sources
✅ **Completeness**: Cover all major regulatory areas
✅ **Real-World**: Test actual user scenarios
✅ **Documentation**: Clear source attribution
✅ **Maintainability**: Easy to update when regulations change
✅ **Performance**: Efficient queries, reasonable test times

## Review Checklist

Before submitting country tests:

- [ ] All rates and thresholds verified against official sources
- [ ] Source URLs documented in test comments
- [ ] Test names clearly describe what's being tested
- [ ] Real-world calculations validated
- [ ] Complete end-to-end paths tested
- [ ] Edge cases covered
- [ ] README documentation complete
- [ ] No hardcoded dates (use parameterized queries)
- [ ] Temporal logic tested (effective dates, supersession)
- [ ] All tests pass with loaded seed data

## Maintenance

Country tests require regular updates:

**Annual Reviews** (minimum):
- Update tax rates for new tax year
- Update thresholds and allowances
- Update social insurance rates
- Update benefit amounts

**As-Needed Updates**:
- New legislation implementation
- Regulatory changes
- New forms or obligations
- Cross-border agreement changes

## Support and Questions

For questions about implementing country-specific tests:

1. Review the [Ireland tests](./ireland/) as a reference implementation
2. Check the [main TEST_README.md](../../../TEST_README.md) for framework details
3. Consult the [graph schema documentation](../../../../docs/architecture/graph/)
4. Create an issue with the `testing` label

---

**Template Version**: 1.0
**Last Updated**: 2024-12-29
**Reference Implementation**: [Ireland Tests](./ireland/)
