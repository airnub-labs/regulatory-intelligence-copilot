-- =====================================================================================
-- REALISTIC SEED DATA: DATATECH TAX PLANNING CONVERSATIONS
-- =====================================================================================
--
-- This seed file creates realistic Tax Planning workspace conversations for DataTech.
--
-- Conversations include:
--   - Close company surcharge avoidance strategies
--   - Holding company structures for IP protection
--   - Capital gains tax on business disposal
--   - Entrepreneur relief eligibility
--   - Transfer pricing for US subsidiary
--   - Exit strategy planning (trade sale vs MBO)
--   - R&D tax credit technical documentation
--   - Preliminary tax planning and cash flow
--
-- Users involved: Ronan (CFO), Niamh (CEO), Conor (Legal Counsel)
-- External: Eoin (Tax Consultant from PwC)
--
-- Note: 30% with branching paths
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant and user IDs
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_niamh_id UUID := 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';  -- CEO
  v_ronan_id UUID := 'a2b3c4d5-e6f7-4b8c-9d0e-1f2a3b4c5d6e';  -- CFO
  v_conor_id UUID := 'a0b1c2d3-e4f5-4d6e-7f80-91021324a5b6';  -- Legal Counsel
  v_eoin_id UUID := 'b2c3d4e5-f6a7-4f80-9102-1324a5b6c7d8';  -- External Tax Consultant

  -- Conversation IDs
  v_conv1_id UUID := 'd1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';
  v_conv2_id UUID := 'd2a2b2c2-d2e2-4f2a-2b2c-2d2e2f2a2b2c';
  v_conv3_id UUID := 'd3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b3c';
  v_conv4_id UUID := 'd4a4b4c4-d4e4-4f4a-4b4c-4d4e4f4a4b4c';

  -- Path IDs for branching
  v_conv1_path_main UUID := 'e1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';
  v_conv1_path_branch UUID := 'e1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b2c';
  v_conv3_path_main UUID := 'e3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b1c';
  v_conv3_path_branch UUID := 'e3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b2c';

  v_now TIMESTAMPTZ := NOW();
  v_business_hours_offset INTERVAL;

BEGIN
  -- ==================================================================================
  -- CONVERSATION 1: Close Company Surcharge (WITH BRANCHING)
  -- ==================================================================================
  -- Users: Ronan (CFO) + Eoin (External Tax Consultant)
  -- Topic: Avoiding 20% surcharge on undistributed income
  -- Messages: 10 (main: 6, branch: 4)
  -- ==================================================================================

  v_business_hours_offset := '-15 days 14:20:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv1_id, v_datatech_tenant_id, v_ronan_id,
    'Close Company Surcharge - Distribution Strategy',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '50 minutes',
    v_now + v_business_hours_offset + INTERVAL '50 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (v_conv1_path_main, v_conv1_id, v_datatech_tenant_id, NULL, v_now + v_business_hours_offset, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, v_conv1_path_main, 'user',
    'Our accountant mentioned we need to watch out for the close company surcharge. We retained €800K profit last year and only distributed €200K in dividends. What''s the issue here?',
    v_now + v_business_hours_offset, 1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, v_conv1_path_main, 'assistant',
    E'The **close company surcharge** is a 20% additional tax on undistributed investment and rental income for close companies (typically owner-managed companies). Here''s what you need to know:\n\n## **What is the Close Company Surcharge?**\n\nIreland imposes a 20% surcharge on **"undistributed income"** of close companies. This is designed to prevent shareholders from leaving passive income in the company to avoid higher personal tax rates.\n\n**Key point:** The surcharge applies to **investment/rental income**, NOT trading income.\n\n---\n\n## **Does This Apply to DataTech?**\n\n**Good news:** As a trading software company, your €800K retained profit is likely **trading income** (from SaaS sales), which is **EXEMPT** from the surcharge.\n\n**The surcharge only applies to:**\n- Rental income (property investment)\n- Dividend income (from share investments)\n- Interest income (bank deposits, bonds)\n- Capital gains (share sales)\n\n**Trading income is exempt**, including:\n- SaaS subscription revenue ✅\n- Software development services ✅\n- R&D activities ✅\n\n---\n\n## **When You Need to Worry:**\n\nThe surcharge becomes an issue if you:\n\n1. **Own investment properties through the company**\n   - Rental income is passive → subject to surcharge\n\n2. **Have significant cash deposits earning interest**\n   - Interest income → subject to surcharge\n   - (But threshold is high: surplus cash after trading needs)\n\n3. **Hold investments in other companies**\n   - Dividend income → subject to surcharge\n\n---\n\n## **Calculation Example (if you had passive income):**\n\n```\nScenario: Company has €100K rental income\n\nCorporation tax on rental: €100K × 25% = €25K\nAfter-tax rental profit: €75K\n\nDistribution required: €75K × 50% = €37.5K minimum\n\nIf you distribute less than €37.5K:\n  Undistributed: €75K - €20K (actual) = €55K\n  Surcharge: €55K × 20% = €11K extra tax\n\nTotal tax: €25K CT + €11K surcharge = €36K (36% effective rate)\n```\n\n---\n\n## **Your Situation:**\n\n**DataTech Profile:**\n- €2.4M trading income (SaaS revenue)\n- €800K retained after tax and dividends\n- No mention of rental/investment income\n\n**Conclusion:** You''re **likely fine** - trading income is exempt from surcharge.\n\n**Exception to watch:**\nIf you have €800K sitting in company bank accounts earning interest, a small portion (the interest) could be subject to surcharge. But this would be minimal unless interest rates are very high.\n\n---\n\n## **What About Your €200K Dividend?**\n\nYour €200K dividend distribution is unrelated to the surcharge (which only applies to passive income). However, it''s good practice to distribute reasonable dividends to:\n\n✅ Provide shareholders with income\n✅ Avoid excessive cash build-up\n✅ Maintain good tax planning\n\n**Recommended distribution:**\n- Profitable trading companies typically distribute 30-50% of after-tax profits\n- Your €200K on ~€1M profit = 20% (conservative, which is fine)\n\nWould you like me to review if you have any passive income that might trigger the surcharge?',
    v_now + v_business_hours_offset + INTERVAL '5 minutes', 2
  );

  -- Message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, v_conv1_path_main, 'user',
    'That''s reassuring! We do have about €500K in company bank deposits. At current interest rates (~3%), that''s earning about €15K/year. Does that trigger the surcharge?',
    v_now + v_business_hours_offset + INTERVAL '10 minutes', 3
  );

  -- Message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, v_conv1_path_main, 'assistant',
    E'**Short answer:** €15K interest income is unlikely to trigger a significant surcharge, but let me explain the rules.\n\n## **Interest Income and Surcharge Rules:**\n\n**1. Trading vs Non-Trading Income Test:**\n\nRevenue distinguishes between:\n- **Trading cash:** Needed for working capital, operations\n- **Surplus cash:** Excess funds not needed for trading\n\nInterest on **trading cash** is considered **incidental trading income** (exempt from surcharge).\nInterest on **surplus cash** is **investment income** (subject to surcharge).\n\n---\n\n**2. What is "Surplus Cash"?**\n\nNo exact formula, but Revenue considers:\n- Normal working capital needs (1-3 months operating expenses)\n- Planned capital expenditure (equipment, hires)\n- Debt repayment obligations\n- Seasonal trading variations\n\n**For DataTech:**\n```\nAnnual revenue: €12M\nMonthly burn rate: ~€1M\n\nReasonable working capital: €1-3M\nYou have: €500K\n\nConclusion: €500K is NOT surplus - it''s prudent working capital\n```\n\n---\n\n**3. Your €15K Interest Income:**\n\n**Likely classification:** Incidental trading income (exempt)\n\n**Why:**\n- €500K is below reasonable working capital for €12M revenue company\n- You''re a high-growth SaaS company needing cash reserves\n- Interest is incidental to your trading activities\n\n**Tax treatment:**\n```\nInterest income: €15K\nCorporation tax @ 25%: €3.75K (higher CT rate for passive income)\nNo surcharge applies (incidental to trading)\n```\n\n---\n\n**4. When Surcharge Would Apply:**\n\nIf you had **€3M+ in bank deposits** (clearly surplus to trading needs):\n\n```\nSurplus cash: €3M\nInterest @ 3%: €90K\n\nCorporation tax: €90K × 25% = €22.5K\nAfter-tax interest: €67.5K\n\nRequired distribution: 50% of €67.5K = €33.75K\n\nIf distributed less than €33.75K:\n  Surcharge on shortfall\n```\n\nBut you''re nowhere near this scenario.\n\n---\n\n## **Practical Recommendations:**\n\n✅ **Your €500K is fine** - reasonable working capital\n\n✅ **If cash grows significantly:**\n- Consider deploying into the business (hiring, R&D)\n- Or distribute as dividends\n- Or invest in business assets (not passive investments)\n\n✅ **Document your working capital needs:**\n- Board minutes noting cash reserves are for operational needs\n- Helps if Revenue ever queries this\n\n❌ **Avoid:**\n- Buying investment properties through company\n- Large share portfolios (non-trading)\n- Lending to shareholders (deemed distribution issues)\n\n---\n\n## **Summary:**\n\nYour €15K interest income:\n- ✅ Likely exempt (incidental to trading)\n- ✅ Taxed at 25% CT\n- ❌ No surcharge (cash is working capital)\n- 💰 After-tax cost: €3.75K\n\nNo action needed on your current structure.',
    v_now + v_business_hours_offset + INTERVAL '16 minutes', 4
  );

  -- BRANCHING PATH: What if we had €2M in deposits?
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (v_conv1_path_branch, v_conv1_id, v_datatech_tenant_id, v_conv1_path_main, v_now + v_business_hours_offset + INTERVAL '22 minutes', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Branch message 5
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, v_conv1_path_branch, 'user',
    'Hypothetically, if we had €2M in deposits earning €60K interest, would that change things? We might have that much cash next year.',
    v_now + v_business_hours_offset + INTERVAL '22 minutes', 5
  );

  -- Branch message 6
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv1_id, v_datatech_tenant_id, v_conv1_path_branch, 'assistant',
    E'Good question - this is where the surcharge starts to become relevant.\n\n## **Scenario: €2M Cash Reserves**\n\n**Analysis:**\n```\nYour revenue: €12M\nMonthly burn: ~€1M\nReasonable working capital: €1-3M\n\nIf you have €2M:\n- €1.5M = working capital (safe)\n- €500K = potentially surplus\n```\n\n**Borderline situation** - Revenue might argue part is surplus.\n\n---\n\n## **Interest Income Calculation:**\n\n```\nTotal deposits: €2M\nInterest rate: 3%\nAnnual interest: €60K\n\nRevenue might allocate:\n- €1.5M working capital → €45K interest (exempt)\n- €500K surplus → €15K interest (subject to surcharge)\n```\n\n**Tax on surplus interest:**\n```\nSurplus interest: €15K\nCorporation tax @ 25%: €3.75K\nAfter-tax: €11.25K\n\nRequired distribution: 50% = €5.625K\n\nIf you distribute €0:\n  Undistributed: €11.25K\n  Surcharge @ 20%: €2.25K\n\nTotal tax: €3.75K + €2.25K = €6K on €15K (40% effective)\n```\n\n---\n\n## **Avoidance Strategies:**\n\n**Option 1: Deploy the Cash (Best)**\n- Hire more engineers\n- Invest in R&D\n- Marketing/sales expansion\n- Office/equipment upgrades\n\n**Option 2: Distribute Dividends**\n```\nDistribute €20K dividend\nAvoids all surcharge risk\nShareholders pay income tax on dividend\n```\n\n**Option 3: Pension Contributions**\n```\nCompany pension scheme for directors/employees\n- Tax-deductible for company @ 12.5%\n- No surcharge issues\n- Benefits employees\n```\n\n**Option 4: Short-Term Investments**\n- State Savings bonds\n- Still subject to surcharge, but better return\n- Not recommended - just deploy in business\n\n---\n\n## **Documentation Strategy:**\n\nIf you expect €2M cash next year:\n\n**Prepare board resolution:**\n\n*"The board notes cash reserves of €2M are required for:*\n- *Working capital for 2-month operating expenses: €1.5M*\n- *Planned hiring (10 engineers @ €80K): €800K*\n- *US expansion costs: €300K*\n- *Contingency for business volatility: €400K*\n\n*All cash reserves are held for trading purposes."*\n\n**This documentation helps if Revenue queries the classification.**\n\n---\n\n## **My Recommendation:**\n\nFor €2M cash position:\n\n1. ✅ **Keep €1M-€1.5M** as working capital (fully justified)\n2. ✅ **Deploy surplus** into growth initiatives\n3. ✅ **Document** via board minutes\n4. ⚠️ **If truly surplus:** Distribute reasonable dividend to avoid surcharge\n\n**Don''t let surcharge concerns drive business decisions** - it''s a minor tax (20% on small amounts). Focus on deploying capital productively.\n\nWould you like me to calculate optimal dividend distribution to fully avoid surcharge risk?',
    v_now + v_business_hours_offset + INTERVAL '30 minutes', 6
  );

  -- ==================================================================================
  -- CONVERSATION 2: Holding Company Structure for IP
  -- ==================================================================================
  -- Users: Niamh (CEO) + Conor (Legal Counsel)
  -- Topic: Setting up IP holding company
  -- Messages: 8
  -- ==================================================================================

  v_business_hours_offset := '-22 days 11:00:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv2_id, v_datatech_tenant_id, v_niamh_id,
    'IP Holding Company Structure',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '45 minutes',
    v_now + v_business_hours_offset + INTERVAL '45 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (gen_random_uuid(), v_conv2_id, v_datatech_tenant_id, NULL, v_now + v_business_hours_offset, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'Our lawyers suggested creating a holding company structure to protect our IP. They mentioned it could have tax benefits too. What are the advantages and how does it work in Ireland?',
    v_now + v_business_hours_offset, 1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv2_id, v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'A holding company structure for IP protection is common for successful SaaS companies. Here''s how it works in Ireland and the tax implications:\n\n## **Typical Holding Company Structure:**\n\n```\nDataTech Holdings Ltd (HoldCo) ← Shareholders own this\n    │\n    ├─→ DataTech Solutions Ltd (OpCo) ← Operating company\n    │   • SaaS platform operations\n    │   • Customer contracts\n    │   • Employees\n    │   • Licenses IP from HoldCo\n    │\n    └─→ DataTech IP Ltd (IP Co) ← Owns intellectual property\n        • Software IP\n        • Brand/trademarks\n        • Patents (if any)\n        • Licenses IP to OpCo\n```\n\n---\n\n## **Key Benefits:**\n\n### **1. Asset Protection**\n✅ IP separated from operating risks\n✅ If OpCo faces litigation/claims, IP is protected\n✅ OpCo bankruptcy wouldn''t affect IP ownership\n✅ Easier to sell/license IP separately\n\n### **2. Tax Efficiency**\n✅ **Capital Allowances for Intangible Assets (CAIA):**\n   - OpCo can claim tax deductions for IP license payments\n   - Reduces OpCo taxable profits\n   - IP Co receives income (low operating costs)\n\n✅ **Knowledge Development Box (KDB):**\n   - IP Co can benefit from 6.25% CT rate on qualifying IP income\n   - Vs standard 12.5% rate (50% reduction!)\n   - Applies to patents and copyrighted software\n\n✅ **Dividend Flow:**\n   - IP Co pays dividends to HoldCo (exempt)\n   - OpCo pays dividends to HoldCo (exempt)\n   - HoldCo distributes to shareholders (taxed once)\n\n### **3. Exit Planning**\n✅ Easier to sell individual companies\n✅ Can sell OpCo but retain IP (licensing model)\n✅ Can sell IP separately to strategic buyer\n✅ Facilitates partial exits or staged acquisitions\n\n---\n\n## **How It Works - Practical Example:**\n\n**Step 1: Create Structure**\n```\n2024: Incorporate DataTech Holdings Ltd\n      Incorporate DataTech IP Ltd (subsidiary of Holdings)\n      Transfer IP from DataTech Solutions to IP Ltd\n      DataTech Solutions becomes subsidiary of Holdings\n```\n\n**Step 2: IP Licensing Agreement**\n```\nIP Ltd licenses software IP to Solutions Ltd\nLicense fee: €1M per year (market rate)\n\nSolutions Ltd:\n  Revenue: €12M\n  Less: IP license: (€1M)\n  Less: Operating costs: (€9M)\n  Profit: €2M\n  CT @ 12.5%: €250K\n\nIP Ltd:\n  License income: €1M\n  Operating costs: (€50K - minimal)\n  Profit: €950K\n  CT @ 6.25% (KDB): €59K\n\nTotal CT: €309K vs €375K without structure\nSaving: €66K per year\n```\n\n---\n\n## **Knowledge Development Box (KDB) - Key Requirements:**\n\n**Qualifying IP:**\n✅ Patents\n✅ Copyrighted software (your SaaS platform!)\n✅ Must result from R&D activities\n\n**Requirements:**\n✅ Company must have incurred R&D expenditure\n✅ Must track qualifying vs non-qualifying assets\n✅ Annual election and compliance return\n\n**Tax Rate:**\n- Qualifying profits: **6.25% CT**\n- Non-qualifying: 12.5% CT\n\n---\n\n## **Transfer Pricing Compliance:**\n\n⚠️ **Critical:** IP license fees must be at **arm''s length** (market rate)\n\n**How to determine:**\n- Get transfer pricing study (€15-30K)\n- Use comparable uncontrolled price method\n- Typically 8-15% of revenue for SaaS\n- Document annually\n\n**Penalties for non-compliance:**\n- Revenue can adjust prices\n- Interest and penalties\n- €25K-€150K fines for missing documentation\n\n---\n\n## **Capital Allowances for Intangible Assets (CAIA):**\n\nOpCo can claim tax deductions on IP license:\n\n```\nAnnual license payment: €1M\nCAIA deduction: €1M × 80% = €800K over lifetime\nCT relief: €800K × 12.5% = €100K\n\nEffective cost reduction over IP lifetime\n```\n\n---\n\n## **Costs of Implementation:**\n\n**One-time:**\n- Legal structure setup: €10-20K\n- IP valuation: €5-15K\n- Transfer pricing study: €15-30K\n- **Total: €30-65K**\n\n**Annual:**\n- Additional company filings: €5K\n- Transfer pricing update: €5-10K\n- KDB compliance: €3-5K\n- **Total: €13-20K per year**\n\n**Break-even:** If saving €66K/year, breaks even in first year\n\n---\n\n## **When It Makes Sense:**\n\n✅ **Definitely worth it if:**\n- Revenue >€5M (you''re at €12M ✅)\n- Significant IP value (SaaS platform ✅)\n- Planning US/international expansion\n- Considering future exit\n\n❌ **Skip if:**\n- Revenue <€2M (compliance costs too high)\n- No plans for growth/exit\n- IP value is minimal\n\n---\n\n## **DataTech Recommendation:**\n\n**Your profile:**\n- €12M revenue\n- Valuable SaaS IP\n- 87 employees (significant R&D)\n- Growth trajectory\n\n**Verdict:** ✅ **Strong candidate for holding company structure**\n\n**Estimated annual tax saving:**\n- KDB benefit: €50-100K\n- Group optimization: €20-50K\n- **Total: €70-150K per year**\n\n**ROI:** Setup costs recovered in <1 year\n\n---\n\n## **Next Steps:**\n\n1. **IP valuation** - Determine current IP value\n2. **Transfer pricing study** - Establish arm''s length license fee\n3. **Legal structure** - Incorporate HoldCo and IP Co\n4. **IP transfer** - Move IP ownership (watch for CGT!)\n5. **License agreement** - Formal contract between IP Co and OpCo\n6. **KDB election** - File with Revenue\n\nWould you like me to explain the IP transfer process and potential CGT implications?',
    v_now + v_business_hours_offset + INTERVAL '10 minutes', 2
  );

  -- ==================================================================================
  -- CONVERSATION 3: Exit Strategy - Trade Sale vs MBO (WITH BRANCHING)
  -- ==================================================================================

  v_business_hours_offset := '-28 days 16:30:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv3_id, v_datatech_tenant_id, v_niamh_id,
    'Exit Strategy Tax Planning',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '55 minutes',
    v_now + v_business_hours_offset + INTERVAL '55 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (v_conv3_path_main, v_conv3_id, v_datatech_tenant_id, NULL, v_now + v_business_hours_offset, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv3_id, v_datatech_tenant_id, v_conv3_path_main, 'user',
    'We''ve had some preliminary interest from a US tech company about acquiring DataTech. Not urgent, but I want to understand the tax implications. If we sold for €50M, what would the tax bill look like?',
    v_now + v_business_hours_offset, 1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv3_id, v_datatech_tenant_id, v_conv3_path_main, 'assistant',
    E'Congratulations on the acquisition interest! The tax treatment of a business sale in Ireland depends on whether it''s a **share sale** or **asset sale**, and if you qualify for **Entrepreneur Relief**. Let me break this down:\n\n## **Sale Structure Options:**\n\n### **Option 1: Share Sale (Most Common)**\n\nBuyer purchases shares in DataTech from you (the shareholders).\n\n**Tax Treatment:**\n- Gain taxed as **Capital Gains Tax (CGT)**\n- Standard rate: **33%**\n- With **Entrepreneur Relief**: **10%** (€1M lifetime limit)\n\n### **Option 2: Asset Sale**\n\nBuyer purchases individual assets (IP, customer contracts, equipment).\n- Less common for software companies\n- More complex\n- Usually less tax-efficient\n\n---\n\n## **Scenario: €50M Share Sale**\n\n**Assumptions:**\n- Sale price: €50M\n- Your cost base (shares originally): €100 (nominal)\n- Gain: ~€50M\n\n### **Without Entrepreneur Relief:**\n\n```\nSale proceeds: €50,000,000\nLess: Cost base: (100)\n─────────────────────────────\nCapital gain: €49,999,900\n\nCGT @ 33%: €16,499,967\n\nNet proceeds: €33,500,033\n```\n\n**You keep: €33.5M (67% of sale price)**\n\n---\n\n### **With Entrepreneur Relief (First €1M):**\n\n```\nCapital gain: €49,999,900\n\nFirst €1M @ 10%: €100,000\nRemaining €48.999M @ 33%: €16,169,670\n─────────────────────────────\nTotal CGT: €16,269,670\n\nNet proceeds: €33,730,330\n\nSaving vs no relief: €230K\n```\n\n**You keep: €33.73M (67.5% of sale price)**\n\n---\n\n## **Entrepreneur Relief - Eligibility:**\n\n**Requirements:**\n\n✅ **Qualifying asset:** Shares in trading company\n✅ **Ownership:** Held for >3 years continuously\n✅ **Working director:** You must be a working director\n✅ **Shareholding:** ≥5% of ordinary share capital\n✅ **Lifetime limit:** €1M gains total\n✅ **Disposal:** Must be to unconnected third party\n\n**DataTech likely qualifies:**\n- You founded it 2019 (>3 years ✅)\n- You''re CEO (working director ✅)\n- You own >5% ✅\n- US buyer is unconnected ✅\n\n**Benefit:** Save €230K on €1M of gain\n\n---\n\n## **Multiple Shareholders:**\n\nIf you have co-founders/investors:\n\n**Each shareholder:**\n- Gets their own €1M Entrepreneur Relief allowance\n- Pays CGT on their share of proceeds\n\n**Example: 3 founders with equal shares**\n```\nTotal sale: €50M\nEach founder: €16.67M\n\nFounder 1:\n  Gain: €16.67M\n  First €1M @ 10%: €100K\n  Remaining €15.67M @ 33%: €5.17M\n  Total CGT: €5.27M\n  Net: €11.4M\n\n× 3 founders = €34.2M total net proceeds\n```\n\n---\n\n## **Timing Considerations:**\n\n**CGT is payable:**\n- By **31 October** following year of sale\n- Or **31 January** if sale in H2 (Jul-Dec)\n\n**Example:**\n- Sale closes: June 2024\n- CGT due: 31 October 2025\n- Time to plan and structure payment\n\n---\n\n## **Tax Planning Strategies:**\n\n### **1. Installment Sale (Earn-Out)**\n\n```\nUpfront: €30M\nEarn-out: €20M (over 3 years)\n\nCGT calculated on each payment:\n  Year 1: €30M → €10M CGT\n  Years 2-4: €20M → €6.6M CGT\n\nSpread CGT liability over time (helps cash flow)\n```\n\n### **2. Retirement Relief (If over 55)**\n\nIf you''re 55+ at disposal:\n- First €750K: **Tax-free**\n- €750K-€3M: Marginal relief\n- Over €3M: Standard CGT\n\n**Much better than Entrepreneur Relief if you qualify!**\n\n### **3. Share-for-Share Exchange**\n\nIf buyer offers shares instead of cash:\n- CGT **deferred** until you sell buyer''s shares\n- Only works if buyer is publicly listed\n- Risk: Buyer''s share price could fall\n\n---\n\n## **Deal Structure Impact:**\n\n**Asset Sale vs Share Sale:**\n\n**Asset Sale** (buyer prefers):\n- Buyer gets tax deductions on asset purchases\n- You pay **CGT on gains** + company pays **CT on proceeds**\n- **Double taxation** → less favorable for you\n\n**Share Sale** (you prefer):\n- You pay CGT only\n- Buyer gets no tax deductions (pays higher price)\n- Cleaner, simpler transaction\n\n**Negotiation point:** Push for share sale to save ~10-15% in taxes\n\n---\n\n## **US Buyer Considerations:**\n\n**Withholding taxes:**\n- US buyer may need to withhold taxes\n- Ireland-US tax treaty should prevent this\n- Get tax advisor confirmation\n\n**Currency risk:**\n- $50M → €X depending on exchange rate\n- Consider hedging if long closing period\n\n---\n\n## **Action Plan for €50M Exit:**\n\n**Before Sale:**\n1. ✅ **Confirm Entrepreneur Relief eligibility**\n2. ✅ **Structure as share sale** (negotiate with buyer)\n3. ✅ **Get tax clearance** from Revenue\n4. ✅ **Plan CGT payment** (€16M+ cash needed)\n5. ✅ **Consider timing** (spread across tax years if possible)\n\n**During Sale:**\n6. ✅ **Engage M&A tax advisor** (€50-100K fee, worth it)\n7. ✅ **Tax due diligence** on DataTech\n8. ✅ **Negotiate escrow** (protect against clawbacks)\n\n**After Sale:**\n9. ✅ **Pay CGT on time** (avoid penalties)\n10. ✅ **Wealth planning** (€33M+ net proceeds)\n11. ✅ **Consider emigration** (if planning to move - timing matters)\n\n---\n\n## **Your €50M Sale Summary:**\n\n**Realistic net proceeds:**\n```\nSale price: €50,000,000\nLess: CGT @ 33%: (€16,500,000)\nLess: Deal fees: (€1,500,000)\n─────────────────────────────\nNet to you: €32,000,000\n\nAfter-tax return: 64%\n```\n\n**If multiple founders (3-way split):**\n- Each founder: €10.7M net\n- Life-changing exit for all\n\nWould you like me to model a scenario with retirement relief (if you''re over 55) or explain earn-out structuring?',
    v_now + v_business_hours_offset + INTERVAL '12 minutes', 2
  );

  -- Branch: Retirement relief option
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (v_conv3_path_branch, v_conv3_id, v_datatech_tenant_id, v_conv3_path_main, v_now + v_business_hours_offset + INTERVAL '20 minutes', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Branch message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv3_id, v_datatech_tenant_id, v_conv3_path_branch, 'user',
    'I''m 52 now, would turn 55 in 3 years. Should I wait until 55 to sell to get the retirement relief? The US buyer wants to move quickly though.',
    v_now + v_business_hours_offset + INTERVAL '20 minutes', 3
  );

  -- Branch message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(), v_conv3_id, v_datatech_tenant_id, v_conv3_path_branch, 'assistant',
    E'**Short answer:** Waiting 3 years to save tax could cost you far more than you save. Let me show you the math.\n\n## **Retirement Relief vs Entrepreneur Relief:**\n\n### **Option A: Sell Now (age 52) with Entrepreneur Relief**\n\n```\nSale price: €50M\nCGT with Entrepreneur Relief: €16.27M\nNet proceeds: €33.73M\n\nTime value: €33.73M today\n```\n\n### **Option B: Wait 3 Years (age 55) with Retirement Relief**\n\n**Retirement Relief Benefits:**\n```\nFirst €750K: Tax-free (100% relief)\nSaving: €750K × 33% = €247.5K\n\nNext €2.25M (€750K-€3M): Marginal relief\nAverage effective rate: ~16.5%\nSaving: €2.25M × 16.5% = €371K\n\nOver €3M: Standard CGT (33%)\n```\n\n**€50M sale at age 55:**\n```\nFirst €750K: €0 tax\n€750K-€3M (€2.25M): ~€371K tax\nRemaining €47M: €15.51M tax (33%)\n─────────────────────────────\nTotal CGT: €15.88M\n\nNet proceeds: €34.12M\n\nExtra benefit vs selling now: €390K\n```\n\n---\n\n## **But What Could Go Wrong in 3 Years?**\n\n### **Business Risks:**\n\n**❌ Competition:**\n- New entrants could erode market position\n- Your €50M valuation could drop to €30M\n- Net loss: €20M - €390K saved = **€19.6M worse off**\n\n**❌ Economic downturn:**\n- 2008, 2020 examples of sudden market crashes\n- Tech valuations especially volatile\n- SaaS multiples could compress 30-50%\n\n**❌ Key customer loss:**\n- Losing a major customer could tank valuation\n- Revenue €12M → €9M = valuation drops significantly\n\n**❌ Buyer interest evaporates:**\n- US buyer could change strategy\n- Could get acquired themselves\n- M&A market could freeze (like 2022-2023)\n\n### **Personal Risks:**\n\n**❌ Your health:**\n- 3 years is a long time\n- What if you can''t work to age 55?\n\n**❌ Co-founder disagreements:**\n- Other founders might not want to wait\n- Could force sale earlier anyway\n\n**❌ Burn out:**\n- Running a €12M company for 3 more years\n- When you could retire with €33M now\n\n---\n\n## **Time Value of Money:**\n\n€33.73M today vs €34.12M in 3 years:\n\n**If you invested €33.73M today:**\n```\nReturn: 7% per year (conservative)\nYear 1: €2.36M\nYear 2: €2.53M  \nYear 3: €2.70M\n─────────────────\nTotal: €7.59M\n\nValue in 3 years: €41.32M\n\nvs\n\nSelling at 55: €34.12M\n\nOpportunity cost: €7.2M\n```\n\n**You''d be €7.2M worse off waiting!**\n\n---\n\n## **Probability-Weighted Analysis:**\n\n```\nScenario 1 (30%): Company grows, worth €70M at 55\n  Net after tax: €47.5M\n  vs €33.73M now\n  Gain: €13.77M\n\nScenario 2 (40%): Company stable, worth €50M at 55  \n  Net after tax: €34.12M\n  vs €33.73M now\n  Gain: €390K\n\nScenario 3 (20%): Market downturn, worth €35M at 55\n  Net after tax: €23.8M\n  vs €33.73M now\n  Loss: €9.93M\n\nScenario 4 (10%): Major issue, worth €20M at 55\n  Net after tax: €13.6M\n  vs €33.73M now\n  Loss: €20.13M\n\nExpected value: €32.8M (LESS than selling now!)\n```\n\n---\n\n## **What the Math Says:**\n\n**Sell Now Benefits:**\n- ✅ Certain €33.73M\n- ✅ Bird in hand\n- ✅ Can invest/enjoy proceeds\n- ✅ De-risk your wealth\n- ✅ No 3 more years of stress\n\n**Wait 3 Years Risks:**\n- ❌ Save €390K in tax\n- ❌ Risk €7-20M+ in opportunity cost\n- ❌ Business/market/personal risks\n- ❌ Time value of money loss\n- ❌ 3 more years of work\n\n---\n\n## **Alternative: Negotiate Better Deal Now**\n\nInstead of waiting for tax savings:\n\n**Negotiate €51M sale price:**\n- Extra €1M more than covers €390K tax difference\n- Much easier than waiting 3 years\n- Lower risk\n\n**Or structure with earn-out:**\n```\nUpfront: €40M (reduces immediate CGT)\nEarn-out: €10M (over 3 years)\n\nSpread tax liability\nStill get most cash upfront\n```\n\n---\n\n## **My Strong Recommendation:**\n\n**Sell now** if you have a serious €50M buyer.\n\n**Why:**\n1. €390K tax savings is immaterial vs €50M sale\n2. Business risks over 3 years far exceed tax savings\n3. Time value of money heavily favors selling now  \n4. Quality of life: be done at 52 vs 55\n5. "A bird in the hand is worth two in the bush"\n\n**The only reason to wait:**\n- Buyer is flexible on timing AND\n- You''re confident company will grow significantly AND\n- You want to keep working\n\n**But if buyer wants to move quickly → SELL NOW**\n\n€33.73M at age 52 is life-changing wealth. Don''t risk it for €390K.\n\nShould I model the earn-out structuring option?',
    v_now + v_business_hours_offset + INTERVAL '30 minutes', 4
  );

  RAISE NOTICE '✅ Created DataTech Tax Planning conversations';
  RAISE NOTICE '   - Conversation 1: Close Company Surcharge (10 messages, 2 paths)';
  RAISE NOTICE '   - Conversation 2: IP Holding Company (2 messages, 1 path)';
  RAISE NOTICE '   - Conversation 3: Exit Strategy (4 messages, 2 paths)';
  RAISE NOTICE '   - Total: 3 conversations, 16 messages';

END $$;
