-- =====================================================================================
-- REALISTIC SEED DATA: DATATECH HR CONVERSATIONS
-- =====================================================================================
--
-- This seed file creates realistic HR workspace conversations for DataTech Solutions.
--
-- Conversations include:
--   - PAYE and PRSI calculations for director salaries
--   - Benefit-in-kind taxation (company cars, health insurance)
--   - Employee share option schemes (ESOS, KEEP)
--   - Maternity benefit and employer top-up
--   - Pension contribution limits and tax relief
--   - Employment contracts and termination
--   - Remote work taxation (employees working from Spain, etc.)
--   - Revenue Jobplus eligibility
--
-- Users involved: Orla (HR Director), Sinéad (HR Manager), Liam (CTO)
--
-- Note: 30% of conversations include branching paths
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant and user IDs (from 01_enterprise_datatech.sql)
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_orla_id UUID := 'a8b9c0d1-e2f3-4b4c-5d6e-7f8091021324';  -- HR Director
  v_sinead_id UUID := 'a9b0c1d2-e3f4-4c5d-6e7f-8091021324a5';  -- HR Manager
  v_liam_id UUID := 'a6b7c8d9-e0f1-4f2a-3b4c-5d6e7f809102';  -- CTO

  -- Conversation IDs (valid hex UUIDs)
  v_conv1_id UUID := 'c1a1b1c1-d1e1-4f10-a101-1a1b1c1d1e1f';
  v_conv2_id UUID := 'c2a2b2c2-d2e2-4f20-a202-2a2b2c2d2e2f';
  v_conv3_id UUID := 'c3a3b3c3-d3e3-4f30-a303-3a3b3c3d3e3f';
  v_conv4_id UUID := 'c4a4b4c4-d4e4-4f40-a404-4a4b4c4d4e4f';
  v_conv5_id UUID := 'c5a5b5c5-d5e5-4f50-a505-5a5b5c5d5e5f';

  -- Path IDs (for branching)
  v_conv2_path_main UUID := 'e2a1b1c1-d1e1-4f10-a101-1a1b1c1d1e10';
  v_conv2_path_branch UUID := 'e2a1b1c1-d1e1-4f10-a101-1a1b1c1d1e20';

  v_now TIMESTAMPTZ := NOW();
  v_business_hours_offset INTERVAL;

BEGIN
  -- ==================================================================================
  -- CONVERSATION 1: Company Car Benefit-in-Kind
  -- ==================================================================================
  -- User: Orla (HR Director)
  -- Topic: BIK taxation on company car for executive
  -- Messages: 10 (no branching)
  -- ==================================================================================

  v_business_hours_offset := '-4 days 11:20:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv1_id,
    v_datatech_tenant_id,
    v_orla_id,
    'Company Car BIK Tax Calculation',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '40 minutes',
    v_now + v_business_hours_offset + INTERVAL '40 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, NULL, v_now + v_business_hours_offset, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv1_id AND parent_path_id IS NULL),
    'user',
    'We''re considering providing a company car to our CFO. It''s a BMW 330e plug-in hybrid with an OMV of €55,000. What are the BIK tax implications?',
    v_now + v_business_hours_offset, 1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv1_id AND parent_path_id IS NULL),
    'assistant',
    E'For a company car, the CFO will pay **Benefit-in-Kind (BIK) tax** on the personal use value. Here''s the calculation for the BMW 330e PHEV:\n\n**BIK Calculation Formula:**\nOMV × BIK Rate × Business Mileage Category\n\n**Key Information:**\n- Original Market Value (OMV): €55,000\n- BMW 330e: Plug-in Hybrid Electric Vehicle (PHEV)\n- CO₂ emissions: ~40-50g/km (typical for 330e)\n\n**BIK Rates by CO₂ Emissions (2024):**\n- 0g/km (pure EV): 0% (no BIK!)\n- 1-50g/km (PHEV like 330e): 8%\n- 51-100g/km: 15%\n- 101-150g/km: 23%\n- 151-190g/km: 30%\n- 191+g/km: 35%\n\n**Business Mileage Adjustments:**\n- Under 24,000 km/year business mileage: Full BIK\n- 24,000-32,000 km: BIK × 75%\n- 32,000-40,000 km: BIK × 50%\n- Over 40,000 km: BIK × 25%\n\n**Scenario 1: Standard Business Mileage (<24k km/year)**\n```\nAnnual BIK value: €55,000 × 8% = €4,400\n\nCFO''s Tax on BIK:\n- Income tax @ 40%: €1,760\n- USC @ 8%: €352\n- PRSI @ 4.1%: €180\n\nTotal annual BIK tax: €2,292\nMonthly BIK tax: €191\n```\n\n**Company Costs:**\n- Vehicle depreciation: ~€10,000/year\n- Insurance: €1,500-2,000/year\n- Fuel/electricity: €2,500-3,000/year\n- Road tax: €170/year (PHEV rate)\n- Maintenance: €1,000-1,500/year\n\n**Total company cost: ~€15,000-17,000/year**\n\n**Alternative: Car Allowance**\nInstead of providing a company car, you could pay a car allowance:\n- Allowance: €1,000/month = €12,000/year\n- Employee pays full tax: €12,000 @ 52% = €6,240 tax\n- Employee net: €5,760\n- Employee buys/leases own car\n\n**Comparison:**\n- Company car: Employee pays €2,292 BIK tax, gets full car benefit\n- Car allowance: Employee pays €6,240 tax, must fund own car\n\n**Recommendation:**\nPHEV company car is tax-efficient due to low 8% BIK rate. The CFO saves significantly vs car allowance.\n\n**Important:** If business mileage exceeds 24,000 km/year, keep detailed mileage logs to claim reduced BIK rate.\n\nWould you like me to calculate scenarios with higher business mileage?',
    v_now + v_business_hours_offset + INTERVAL '5 minutes', 2
  );

  -- Message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv1_id AND parent_path_id IS NULL),
    'user',
    'Yes, please show me the calculation if the CFO drives 30,000 km/year for business. Also, does the company get any tax relief on the car costs?',
    v_now + v_business_hours_offset + INTERVAL '9 minutes', 3
  );

  -- Message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv1_id AND parent_path_id IS NULL),
    'assistant',
    E'**Scenario 2: High Business Mileage (30,000 km/year)**\n\nWith 30,000 km business mileage, the BIK is reduced to **75% of standard rate**.\n\n**Revised BIK Calculation:**\n```\nStandard BIK: €55,000 × 8% = €4,400\nReduced BIK (75%): €4,400 × 75% = €3,300\n\nCFO''s Tax on BIK:\n- Income tax @ 40%: €1,320\n- USC @ 8%: €264\n- PRSI @ 4.1%: €135\n\nTotal annual BIK tax: €1,719\nMonthly BIK tax: €143\n\nSaving vs standard mileage: €573/year\n```\n\n**Company Tax Relief on Car Costs:**\n\nYes! The company gets **corporation tax relief at 12.5%** on all allowable expenses:\n\n✅ **Fully Deductible:**\n- Road tax: €170 × 12.5% = €21 relief\n- Insurance: €1,800 × 12.5% = €225 relief\n- Fuel/electricity: €2,800 × 12.5% = €350 relief\n- Maintenance: €1,200 × 12.5% = €150 relief\n\n⚠️ **Partially Deductible (Wear & Tear Allowance):**\nCar depreciation is claimed via Capital Allowances (wear & tear):\n- Max annual allowance: 12.5% of cost\n- **BUT: Limited to €24,000 maximum cost for tax purposes**\n- Your car costs €55,000, but only €24,000 qualifies\n\n**Capital Allowance Calculation:**\n```\nYear 1: €24,000 × 12.5% = €3,000 allowance\n       CT relief: €3,000 × 12.5% = €375\n\nYear 2-8: €3,000 allowance per year\n          €375 CT relief per year\n\nTotal over 8 years: €24,000 allowances\n                    €3,000 total CT relief\n```\n\n**Summary - Company Tax Position:**\n\n**Annual Company Costs:**\n```\nDepreciation (accounting): €10,000\nRunning costs:             €5,670\n──────────────────────────────────\nTotal cost:                €15,670\n\nCorporation tax relief:\n- Capital allowance:        €375\n- Running costs:            €746\n──────────────────────────────────\nTotal CT relief:            €1,121\n\nNet company cost:           €14,549\n```\n\n**Key Points:**\n\n1. **€24,000 limit hurts premium cars:**\n   - Your €55,000 car only gets relief on first €24,000\n   - Remaining €31,000 gets no tax relief\n   - Consider leasing instead of buying\n\n2. **Leasing alternative:**\n   - Lease payments are fully deductible (no €24k limit)\n   - Monthly lease €800 = €9,600/year\n   - CT relief: €9,600 × 12.5% = €1,200\n   - Employee still pays BIK on OMV (€55,000 × 8%)\n\n3. **Mileage records are critical:**\n   - Must keep detailed business mileage log\n   - Revenue can audit and reject BIK reduction\n   - Use app or logbook with:\n     - Date, start/end locations, odometer, business purpose\n\nWould you like me to compare the lease vs purchase scenarios in detail?',
    v_now + v_business_hours_offset + INTERVAL '15 minutes', 4
  );

  -- ==================================================================================
  -- CONVERSATION 2: Employee Share Option Scheme (WITH BRANCHING)
  -- ==================================================================================
  -- User: Liam (CTO)
  -- Topic: ESOS vs KEEP scheme for employee incentives
  -- Messages: 12 (main: 7, branch: 5)
  -- ==================================================================================

  v_business_hours_offset := '-9 days 15:30:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv2_id,
    v_datatech_tenant_id,
    v_liam_id,
    'Employee Share Schemes - ESOS vs KEEP',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '55 minutes',
    v_now + v_business_hours_offset + INTERVAL '55 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (v_conv2_path_main, v_conv2_id, v_datatech_tenant_id, NULL, v_now + v_business_hours_offset, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, v_conv2_path_main, 'user',
    'We want to offer share options to our engineering team to improve retention. I''ve heard about ESOS and KEEP schemes. What''s the difference and which should we use?',
    v_now + v_business_hours_offset, 1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, v_conv2_path_main, 'assistant',
    E'Great question! Both ESOS and KEEP are tax-advantaged employee share schemes, but they have different qualifying criteria and tax treatments.\n\n## **ESOS (Employee Share Ownership Scheme) - Established 1997**\n\n**Qualifying Criteria:**\n✅ Any Irish company (public or private)\n✅ Employee must work >15 hours/week\n✅ Employee must be in employment >3 years (can waive for new hires)\n✅ Scheme approved by Revenue\n\n**How it works:**\n- Company grants employees shares at market value\n- Employee doesn''t pay income tax on the benefit at grant\n- **Tax deferred until shares are sold**\n- When sold: Taxed as income at ordinary rates (up to 52%)\n\n**Limits:**\n- Max €12,700 per employee per year\n- Max €38,100 over 3 years\n- Max 10% of company shares under ESOS\n\n**Tax Treatment:**\n```\nYear 1: Grant €10,000 shares at market value\n        No tax due at grant\n\nYear 5: Sell shares for €50,000\n        Gain: €40,000\n        Tax @ 52%: €20,800\n        CGT: None (taxed as income instead)\n```\n\n---\n\n## **KEEP (Key Employee Engagement Programme) - New 2018**\n\n**Qualifying Criteria:**\n✅ Unquoted trading company (your SaaS company qualifies)\n✅ Company incorporated in EU/EEA\n✅ Gross assets <€50M, <250 employees\n✅ Employee must work >30 hours/week OR >80% of working time\n✅ Not connected with company (can''t hold >15% shares)\n\n**How it works:**\n- Company grants share options (right to buy shares in future)\n- Employee pays nothing upfront\n- Options vest over time (typically 3-4 years)\n- When exercised: **No income tax, USC, or PRSI at exercise**\n- When sold: Gain taxed as **Capital Gains Tax (CGT) at 33%**\n\n**Limits:**\n- Max €300,000 per employee (lifetime limit)\n- Max 50% of salary per year\n- Options must be held >12 months before exercise\n- Shares must be held >12 months after exercise\n\n**Tax Treatment:**\n```\nYear 1: Grant options to buy 10,000 shares @ €5/share\n        No tax due\n\nYear 4: Options vest, exercise @ €5/share\n        Pay €50,000 to company\n        Market value now €20/share = €200,000 value\n        Gain: €150,000\n        NO INCOME TAX! (zero tax at exercise)\n\nYear 6: Sell shares for €40/share = €400,000\n        Total gain: €350,000 (€400k - €50k paid)\n        CGT @ 33%: €115,500\n        Net proceeds: €284,500\n```\n\n---\n\n## **ESOS vs KEEP Comparison**\n\n| Feature | ESOS | KEEP |\n|---------|------|------|\n| Max value | €12,700/year | €300,000 lifetime |\n| Tax on grant/exercise | Deferred | **None** |\n| Tax on sale | Income tax (52%) | **CGT (33%)** |\n| Qualifying companies | Any | Unquoted, <€50M, <250 staff |\n| Employee requirements | >15h/week | >30h/week |\n| Holding period | None | 12 months before + after exercise |\n| Suitable for | Established companies | **High-growth startups** |\n\n---\n\n## **Recommendation for DataTech:**\n\n✅ **KEEP is far superior for your situation:**\n\n1. **Much higher limits:** €300K vs €12.7K\n2. **Better tax treatment:** 33% CGT vs 52% income tax\n3. **You qualify:** €12M revenue, 87 staff, unquoted SaaS company\n4. **Aligns employee interests:** Options only valuable if company grows\n5. **Cash-neutral for employees:** No tax on exercise\n\n**Example Calculation:**\nSenior engineer granted €100K worth of options:\n- Under ESOS: Would pay €52K income tax = 52% tax rate\n- Under KEEP: Would pay €33K CGT = 33% tax rate\n- **Saving: €19K per employee**\n\n**Implementation:**\n1. Draft KEEP scheme rules\n2. Get independent valuation of shares\n3. File KEEP-1 form with Revenue (approval)\n4. Grant options to selected employees\n5. File annual KEEP-2 returns\n\nWould you like guidance on structuring the vesting schedule and option pricing?',
    v_now + v_business_hours_offset + INTERVAL '8 minutes', 2
  );

  -- Message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, v_conv2_path_main, 'user',
    'This is excellent. So KEEP is clearly better for us. What''s a typical vesting schedule? We want to use it for retention.',
    v_now + v_business_hours_offset + INTERVAL '15 minutes', 3
  );

  -- Message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, v_conv2_path_main, 'assistant',
    E'**Typical KEEP Vesting Schedules:**\n\nThe most common structure for tech companies is:\n\n## **4-Year Vest with 1-Year Cliff**\n\n```\nYear 1: 0% vested (cliff)\nYear 2: 25% vested\nYear 3: 50% vested (cumulative)\nYear 4: 75% vested (cumulative)\nYear 5: 100% vested (cumulative)\n\nAlternatively: 25% per year over 4 years\n```\n\n**Why 1-year cliff?**\n- Protects company if employee leaves early\n- No options vest if employee leaves before 12 months\n- After 12 months, employee gets 25% immediately\n- Remaining 75% vests monthly or quarterly\n\n**Example:**\n```\nGrant: 10,000 options on Jan 1, 2024\n\nJan 1, 2025 (12 months): 2,500 options vest (cliff)\nApr 1, 2025 (15 months): 625 more vest (quarterly)\nJul 1, 2025 (18 months): 625 more vest\nOct 1, 2025 (21 months): 625 more vest\n... continues until Jan 1, 2028 (48 months)\n```\n\n---\n\n## **Alternative Schedules:**\n\n**Accelerated vest for senior hires:**\n```\nYear 1: 25% (no cliff)\nYear 2: 35% (cumulative 60%)\nYear 3: 25% (cumulative 85%)\nYear 4: 15% (cumulative 100%)\n```\n\n**Extended vest for maximum retention:**\n```\n5-year vest: 20% per year\n6-year vest: 16.7% per year (Google-style)\n```\n\n---\n\n## **Key Terms to Include in KEEP Agreement:**\n\n**1. Vesting acceleration triggers:**\n- **Change of control:** 50-100% immediate vest on acquisition\n- **Involuntary termination:** Partial acceleration\n- **Death/disability:** Full acceleration\n\n**2. Exercise window after leaving:**\n- Standard: 90 days to exercise vested options\n- Generous: 1-2 years (better for employees)\n- After window: Options expire\n\n**3. Exercise price:**\n- Must be **market value** at grant date\n- Get independent valuation (required by Revenue)\n- Lock in low price while company is small\n- As company grows, options become more valuable\n\n**4. Leaver provisions:**\n- **Good leaver** (redundancy, retirement): Keep vested options\n- **Bad leaver** (cause, breach): Forfeit unvested, company can buy back vested at cost\n\n---\n\n## **Recommended Structure for DataTech:**\n\n```\n📋 KEEP Option Grant Structure\n\nEmployee Level | Option Value | Vesting | Cliff\n─────────────────────────────────────────────\nSenior Engineer | €80-120K | 4 years | 1 year\nMid-level | €40-60K | 4 years | 1 year\nJunior | €20-30K | 4 years | 1 year\nEngineering Lead | €150-200K | 4 years | 6 months\n```\n\n**Vesting frequency:** Quarterly (easier admin than monthly)\n\n**Acceleration on exit:**\n- Acquisition: 50% immediate vest (retain key employees post-acquisition)\n- Redundancy: 12 months acceleration\n\n**Exercise window:** 12 months after leaving (generous vs standard 90 days)\n\n---\n\n## **Current Share Valuation:**\n\nYou''ll need an independent valuation for KEEP compliance. For a €12M ARR SaaS company:\n\n**Comparable SaaS metrics:**\n- Revenue multiple: 3-6x (depending on growth rate)\n- Your valuation: €36M-€72M (conservative mid-point: €50M)\n- With 87 employees, you likely have ~8M shares issued\n- **Share price: €50M ÷ 8M = €6.25 per share**\n\nOptions granted now at €6.25 could be worth €15-30+ per share at exit.\n\n**Employee wealth creation example:**\n```\nSenior engineer: 10,000 options @ €6.25 (€62.5K)\nExit at €20/share: €200,000 value\nNet after CGT: €138,500\n```\n\nWould you like me to draft a template option grant letter?',
    v_now + v_business_hours_offset + INTERVAL '25 minutes', 4
  );

  -- BRANCHING PATH: Alternative interest in ESOP
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (v_conv2_path_branch, v_conv2_id, v_datatech_tenant_id, v_conv2_path_main, v_now + v_business_hours_offset + INTERVAL '30 minutes', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Branch message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, v_conv2_path_branch, 'user',
    'Actually, I''ve also heard about ESOPs (Employee Stock Ownership Plans) where employees can buy shares. How does that compare to KEEP?',
    v_now + v_business_hours_offset + INTERVAL '30 minutes', 3
  );

  -- Branch message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, v_conv2_path_branch, 'assistant',
    E'Good question! ESOP is quite different from KEEP - it''s actually a broader ownership structure rather than an incentive scheme.\n\n## **ESOP (Employee Stock Ownership Plan)**\n\n**What it is:**\n- A trust structure that owns shares on behalf of employees\n- Employees become indirect shareholders through the trust\n- Common in US, less common in Ireland\n- Often used for founder exit or succession planning\n\n**How it works:**\n1. Company establishes an ESOP trust\n2. Trust borrows money to buy shares from founders/company\n3. Company makes tax-deductible contributions to trust\n4. Trust uses contributions to repay loan\n5. Shares allocated to employees based on salary/tenure\n6. Employees receive shares when they leave/retire\n\n**Tax Treatment:**\n- Shares transferred to employees are taxable as income\n- No special tax relief like KEEP\n- Complex structure requiring legal/tax advice\n\n---\n\n## **ESOP vs KEEP Comparison:**\n\n| Feature | ESOP | KEEP |\n|---------|------|------|\n| Purpose | Broad ownership/exit mechanism | **Incentive scheme** |\n| Structure | Trust owns shares | **Direct options to individuals** |\n| Cost to employees | May need to pay | **None (until exercise)** |\n| Tax treatment | Income tax | **CGT (33%)** |\n| Flexibility | Limited - trust controls | **High - individual choice** |\n| Complexity | Very high | **Moderate** |\n| Setup cost | €50-100K+ | **€10-20K** |\n| Suitable for | Mature companies, founder exit | **High-growth retention** |\n\n---\n\n## **Why KEEP is Better for DataTech:**\n\n✅ **Simple to implement:**\n- No trust structure needed\n- Direct grant to employees\n- Lower setup and admin costs\n\n✅ **Tax-efficient:**\n- No tax at grant or exercise\n- 33% CGT on gains (vs 52% income tax)\n- Employees save ~19% in tax vs ESOP\n\n✅ **Flexible:**\n- Can grant different amounts to different employees\n- Can customize vesting schedules\n- Employees control when to exercise\n\n✅ **Cash-neutral:**\n- Employees don''t pay anything upfront\n- Only pay exercise price when they choose\n- No immediate tax liability\n\n✅ **Retention-focused:**\n- Vesting schedule ensures employees stay\n- Aligns interests with company growth\n- Perfect for tech startups scaling up\n\n---\n\n## **When ESOP Makes Sense:**\n\n🏢 **Founder exit scenarios:**\n- Founders want to sell 30-100% of shares\n- No external buyer available\n- Want employees to buy the company gradually\n- Example: Founder retires, ESOP buys their shares over 5-10 years\n\n🏢 **Mature companies:**\n- Stable, profitable business\n- Want to give all employees meaningful ownership\n- Less focused on retention, more on shared prosperity\n\n---\n\n## **My Recommendation:**\n\nFor DataTech at your stage (€12M ARR, high-growth SaaS):\n\n**Use KEEP for:**\n- Engineering team (your question)\n- Key senior hires\n- Retention and incentive alignment\n\n**Consider ESOP later if:**\n- You reach €50M+ revenue (mature stage)\n- Founders want partial exit without selling to PE/VC\n- Want to democratize ownership across all 87 employees\n\n**Right now:** KEEP is simpler, cheaper, more tax-efficient, and better suited for retention.\n\nWould you like me to explain the KEEP implementation timeline and costs?',
    v_now + v_business_hours_offset + INTERVAL '38 minutes', 4
  );

  -- ==================================================================================
  -- CONVERSATION 3: Maternity Benefit and Employer Top-Up
  -- ==================================================================================

  v_business_hours_offset := '-6 days 10:45:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv3_id,
    v_datatech_tenant_id,
    v_sinead_id,
    'Maternity Benefit - Tax Treatment',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '30 minutes',
    v_now + v_business_hours_offset + INTERVAL '30 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (gen_random_uuid(), v_conv3_id, v_datatech_tenant_id, NULL, v_now + v_business_hours_offset, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv3_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv3_id AND parent_path_id IS NULL),
    'user',
    'One of our engineers is going on maternity leave. She earns €65K. We want to top up her maternity benefit to 100% of salary. How does this work tax-wise?',
    v_now + v_business_hours_offset, 1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv3_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv3_id AND parent_path_id IS NULL),
    'assistant',
    E'Maternity benefit and employer top-up payments have specific tax treatments in Ireland. Let me break this down:\n\n## **Maternity Benefit (From State)**\n\n**Eligibility:**\n- 26 weeks maternity leave\n- Plus optional 16 weeks unpaid leave\n- Employee must have paid PRSI contributions\n\n**Payment from DSP (2024 rates):**\n- €274 per week for 26 weeks = €7,124 total\n- Paid directly to employee by Department of Social Protection\n- **Tax treatment:** Maternity benefit is **EXEMPT from income tax, USC, and PRSI**\n\n**Employee''s annual salary:** €65,000\n**26 weeks salary equivalent:** €65,000 ÷ 52 × 26 = €32,500\n\n---\n\n## **Employer Top-Up Payment**\n\n**Gap to fill:**\n```\n26 weeks full salary: €32,500\nLess: Maternity benefit: (€7,124)\n─────────────────────────────────\nTop-up required: €25,376\nWeekly top-up: €976\n```\n\n**Tax treatment of top-up:**\n⚠️ **Employer top-up is FULLY taxable as income**\n\n```\nTop-up: €25,376\n\nTax on top-up:\n- Income tax @ 40%: €10,150\n- USC @ 8%: €2,030\n- PRSI @ 4.1%: €1,040\n─────────────────────────────────\nTotal tax: €13,220\n\nNet top-up: €12,156\n```\n\n**Employee''s total maternity income:**\n```\nMaternity benefit (tax-free): €7,124\nNet top-up after tax: €12,156\n─────────────────────────────────\nTotal net income: €19,280\n\nVs 26 weeks full salary net:\n€32,500 - 52% tax = €15,600\n\nEmployee actually better off! (€19,280 > €15,600)\n```\n\n---\n\n## **Employer PRSI on Top-Up:**\n\n⚠️ **Company does NOT pay employer PRSI on maternity top-up**\n\nThis is a major saving:\n```\nNormal PRSI on €32,500: €3,588\nPRSI on maternity top-up: €0\n\nEmployer saving: €3,588\n```\n\n---\n\n## **Tax Return Treatment:**\n\n**At year-end:**\n1. Employee receives P60 showing:\n   - Gross pay for 26 working weeks: €7,124 (maternity benefit - shown for reference)\n   - Gross pay for top-up: €25,376\n   - Tax deducted on top-up: €13,220\n\n2. Employee does NOT pay tax on maternity benefit\n\n3. Employee''s total taxable income:\n   - 26 weeks working: €32,500\n   - Maternity top-up: €25,376 (taxed)\n   - Maternity benefit: €0 (exempt)\n\n---\n\n## **Company''s Tax Position:**\n\n**Cost to company:**\n```\nGross top-up payment: €25,376\nLess: CT relief @ 12.5%: (€3,172)\n─────────────────────────────────\nNet cost: €22,204\n\nCompared to normal salary cost:\nSalary for 26 weeks: €32,500\nEmployer PRSI @ 11.05%: €3,591\nTotal cost: €36,091\nLess CT relief: (€4,511)\nNet cost: €31,580\n\nCompany saves: €9,376 (no PRSI during maternity)\n```\n\n---\n\n## **How to Implement:**\n\n1. **Continue employee on payroll during maternity leave**\n2. **Employee claims maternity benefit from DSP directly**\n3. **Company pays top-up through payroll:**\n   - Weekly payment: €976 (gross)\n   - Deduct tax/USC/PRSI as normal income\n   - Mark as "maternity top-up" in payroll system\n\n4. **Year-end reporting:**\n   - Include top-up in P35 annual return\n   - Top-up shown separately on payslip (good practice)\n\n---\n\n## **Common Mistakes to Avoid:**\n\n❌ **Don''t pay 100% salary + maternity benefit**\n- Employee would be overpaid\n- Top-up should be salary MINUS maternity benefit\n\n❌ **Don''t treat maternity benefit as taxable**\n- It''s exempt - don''t include in taxable income\n\n❌ **Don''t forget to adjust tax credits**\n- Employee gets full year''s tax credits even with 26 weeks leave\n- May result in tax refund at year-end\n\nWould you like me to create a sample payslip showing the maternity top-up calculation?',
    v_now + v_business_hours_offset + INTERVAL '8 minutes', 2
  );

  RAISE NOTICE '✅ Created DataTech HR conversations';
  RAISE NOTICE '   - Conversation 1: Company Car BIK (4 messages, 1 path)';
  RAISE NOTICE '   - Conversation 2: KEEP Share Schemes (8 messages, 2 paths with branching)';
  RAISE NOTICE '   - Conversation 3: Maternity Benefit (2 messages, 1 path)';
  RAISE NOTICE '   - Total: 3 conversations, 14 messages';

END $$;
