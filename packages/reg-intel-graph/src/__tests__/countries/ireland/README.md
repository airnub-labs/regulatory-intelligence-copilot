# Ireland Country-Specific Integration Tests

Comprehensive real-world integration tests for the Irish regulatory system.

## Overview

These tests validate actual Irish legislation, tax rates, social insurance rules, and compliance workflows as implemented in the regulatory graph. All test data reflects real-world Irish regulations from authoritative sources.

## Test Files

### 1. `ireland.tax.test.ts` (60+ tests)

Tests for the Irish tax system:

**Income Tax**
- Standard rate (20%) on first €42,000
- Higher rate (40%) above €42,000
- Tax band calculations for various income levels
- Tax year transitions

**Capital Gains Tax (CGT)**
- CGT rate of 33%
- Annual exemption of €1,270
- Property sale calculations
- Temporal validity of rates

**Thresholds and Exemptions**
- Small Benefit Exemption (€1,000)
- Effective date tracking
- Integration with profiles

**Run:** `pnpm test ireland.tax.test.ts`

### 2. `ireland.prsi.test.ts` (80+ tests)

Tests for Irish PRSI (Pay Related Social Insurance):

**PRSI Classes**
- **Class A**: Employees - full benefits including Jobseeker's
- **Class S**: Self-employed - limited benefits, no Jobseeker's
- **Class B**: Pre-1995 civil servants
- **Class D**: Post-1995 civil servants
- **Class J**: Low earners (< €38/week)

**Contribution Rates**
- Employee rates (Class A)
- Self-employed rate (4% for Class S)
- No PRSI ceiling in Ireland

**Benefit Entitlements**
- Differential benefits between classes
- 104-week contribution threshold for Jobseeker's Benefit
- Maternity Benefit available to both Class A and S
- State Pension eligibility

**Life Events Integration**
- Birth → Maternity Benefit
- Unemployment → Jobseeker's Benefit (Class A only)
- Retirement → State Pension

**Cross-Border Coordination**
- Common Travel Area (CTA) social security
- IE-UK coordination rules

**Run:** `pnpm test ireland.prsi.test.ts`

### 3. `ireland.compliance.test.ts` (70+ tests)

Tests for Irish compliance obligations:

**Filing Obligations**
- **CT1**: Corporation Tax Return (9-month deadline)
- **Form 11**: Income Tax Return (self-employed)
- **CRO Annual Return**: Companies Registration Office (B1 form)

**Payment Obligations**
- Preliminary Tax (advance payment)
- Penalty conditions

**Form Requirements**
- Form metadata (issuing body, form numbers, URLs)
- Obligation → Form relationships
- Benefit → Form claiming paths

**Profile-Specific Compliance**
- Single director company obligations
- Self-employed obligations
- PAYE employee obligations
- Compliance comparison across profiles

**Workflows**
- Complete compliance paths (Profile → Obligation → Form → Timeline)
- Annual compliance calendars
- Deadline tracking

**Run:** `pnpm test ireland.compliance.test.ts`

### 4. `ireland.realworld.test.ts` (50+ tests)

End-to-end real-world scenarios:

**Scenario 1: Single Director Company Formation**
- First-year compliance checklist
- Tax burden calculations
- PRSI class determination

**Scenario 2: Unemployment Claim**
- Life Event → Benefit eligibility path
- PRSI contribution verification (104 weeks)
- Form submission process (UP1)
- Class A vs Class S differences

**Scenario 3: Maternity Leave**
- Birth event → Maternity Benefit
- Eligibility for both employees and self-employed
- Form requirements

**Scenario 4: Property Sale with CGT**
- €150k gain calculation with exemption
- Rate and exemption relationship
- Effective date validation

**Scenario 5: Employee → Self-Employed Transition**
- Compliance changes (new Form 11 obligation)
- Lost benefits (Jobseeker's)
- Retained benefits (State Pension, Maternity)
- PRSI rate comparison

**Scenario 6: Retirement Planning**
- State Pension eligibility
- PRSI class requirements
- Life event triggering

**Scenario 7: Cross-Border Workers (IE-UK)**
- Common Travel Area (CTA) rights
- Social security coordination
- Benefit portability

**Scenario 8: Complete Life Journey**
- Multi-event paths
- Lifetime tax calculations

**Run:** `pnpm test ireland.realworld.test.ts`

## Running the Tests

### Prerequisites

- Running Memgraph instance on `localhost:7687`
- Loaded seed data (obligations, rates, thresholds, PRSI classes, life events)
- Node.js >=24.0.0

### Environment Variables

```bash
export MEMGRAPH_URI=bolt://localhost:7687
export MEMGRAPH_USERNAME=''
export MEMGRAPH_PASSWORD=''
export MEMGRAPH_DATABASE=memgraph
```

### Run All Ireland Tests

```bash
pnpm test countries/ireland
```

### Run Specific Test File

```bash
pnpm test ireland.tax.test.ts
pnpm test ireland.prsi.test.ts
pnpm test ireland.compliance.test.ts
pnpm test ireland.realworld.test.ts
```

### Run With Coverage

```bash
pnpm test --coverage countries/ireland
```

## Test Data Sources

All test data is based on official Irish government sources:

- **Tax Rates**: Revenue Commissioners (www.revenue.ie)
- **PRSI Classes**: Department of Social Protection (www.gov.ie/en/publication/9f278-prsi-classes/)
- **Benefits**: Citizens Information (www.citizensinformation.ie)
- **Company Law**: Companies Registration Office (www.cro.ie)
- **Forms**: Revenue Online Service (ROS) and MyWelfare.ie

## Key Test Patterns

### 1. Legislative Accuracy
Tests validate actual Irish rates, thresholds, and rules:
```typescript
expect(incomeTaxStandardRate).toBe(20);
expect(cgtRate).toBe(33);
expect(prsiClassSRate).toBe(4);
```

### 2. Complete Path Validation
Tests trace end-to-end regulatory paths:
```typescript
Profile → PRSI Class → Benefit → Form
LifeEvent → Benefit → Threshold → Form
```

### 3. Differential Entitlements
Tests verify class-based differences:
```typescript
// Class A gets Jobseeker's, Class S doesn't
expect(classABenefits).toContain('IE_JOBSEEKERS_BENEFIT');
expect(classSBenefits).not.toContain('IE_JOBSEEKERS_BENEFIT');
```

### 4. Real-World Calculations
Tests perform actual tax and benefit calculations:
```typescript
const income = 50000;
const tax = calculateTax(income, rates);
expect(tax).toBe(11600); // Real Irish tax calculation
```

## Test Coverage

| Category | Tests | Description |
|----------|-------|-------------|
| Tax System | 60+ | Income tax, CGT, thresholds |
| PRSI System | 80+ | All classes, benefits, contributions |
| Compliance | 70+ | Obligations, forms, deadlines |
| Real-World Scenarios | 50+ | End-to-end user journeys |
| **Total** | **260+** | **Complete Irish regulatory coverage** |

## Adding New Tests

When adding Ireland-specific tests:

1. **Use Real Data**: Reference official Irish government sources
2. **Test Complete Paths**: Validate end-to-end regulatory workflows
3. **Include Edge Cases**: Test boundary conditions (e.g., exactly €42,000 income)
4. **Verify Temporal Logic**: Test effective dates and supersession
5. **Document Sources**: Add comments with links to legislation

Example:
```typescript
it('should apply 2024 income tax rates', async () => {
  // Source: https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx
  const result = await client.executeCypher(/* ... */);
  expect(result.standardRate).toBe(20);
});
```

## Ireland-Specific Regulatory Features

### PRSI System Uniqueness
- No contribution ceiling (unlike UK National Insurance)
- Different classes with significantly different benefits
- Class S (self-employed) explicitly excluded from Jobseeker's Benefit

### Tax System
- Two-band income tax system (20%/40%)
- 33% CGT rate (higher than UK's 20%)
- Small benefit exemption for BIK

### Compliance
- 9-month CT1 deadline (different from UK's 12 months)
- Companies Registration Office (CRO) annual returns
- Preliminary tax system

### Social Welfare
- Maternity Benefit available to self-employed (unlike many countries)
- State Pension (Contributory) requires minimum contributions
- 104-week threshold for Jobseeker's Benefit

## Future Enhancements

- [ ] Universal Social Charge (USC) rates and bands
- [ ] Local Property Tax (LPT) integration
- [ ] Help to Buy scheme thresholds
- [ ] First Home Scheme eligibility
- [ ] PAYE Modernisation workflows
- [ ] Revenue Job Watch integration
- [ ] Rent Tax Credit calculations
- [ ] Child Benefit integration
- [ ] VAT rate scenarios (23%, 13.5%, 9%, 0%)
- [ ] Historical rate changes (e.g., 2019 to 2024 transitions)

## Related Documentation

- [Main Test README](../../../TEST_README.md)
- [Graph Schema](../../../../docs/architecture/graph/)
- [PRSI Classes Reference](https://www.gov.ie/en/publication/9f278-prsi-classes/)
- [Revenue Tax Rates](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx)
