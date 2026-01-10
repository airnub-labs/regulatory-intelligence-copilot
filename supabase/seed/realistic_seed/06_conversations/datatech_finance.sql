-- =====================================================================================
-- REALISTIC SEED DATA: DATATECH FINANCE CONVERSATIONS
-- =====================================================================================
--
-- This seed file creates realistic Finance workspace conversations for DataTech Solutions.
--
-- Conversations include:
--   - Corporation tax calculations with R&D credits
--   - VAT compliance queries (SaaS sales to EU)
--   - Transfer pricing for subsidiaries
--   - Close company surcharge implications
--   - Preliminary tax calculations
--   - Multiple conversation paths through message branching
--
-- Users involved: Ronan (CFO), Siobhan (Finance Director), Declan (Finance Manager)
--
-- Note: 30% of conversations include branching paths to demonstrate "what-if" scenarios
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant and user IDs (from 01_enterprise_datatech.sql)
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_ronan_id UUID := 'a2b3c4d5-e6f7-4b8c-9d0e-1f2a3b4c5d6e';  -- CFO
  v_siobhan_id UUID := 'a3b4c5d6-e7f8-4c9d-0e1f-2a3b4c5d6e7f';  -- Finance Director
  v_declan_id UUID := 'a4b5c6d7-e8f9-4d0e-1f2a-3b4c5d6e7f80';  -- Finance Manager

  -- Conversation IDs
  v_conv1_id UUID := 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';
  v_conv2_id UUID := 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c';
  v_conv3_id UUID := 'f3a4b5c6-d7e8-4f9a-0b1c-2d3e4f5a6b7c';
  v_conv4_id UUID := 'f4a5b6c7-d8e9-4f0a-1b2c-3d4e5f6a7b8c';
  v_conv5_id UUID := 'f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c';

  -- Path IDs (for branching conversations)
  v_conv1_path_main UUID := 'c1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';
  v_conv1_path_branch UUID := 'c1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b2c';
  v_conv3_path_main UUID := 'c3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b1c';
  v_conv3_path_branch UUID := 'c3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b2c';

  v_now TIMESTAMPTZ := NOW();
  v_business_hours_offset INTERVAL;

BEGIN
  -- ==================================================================================
  -- CONVERSATION 1: Corporation Tax Calculation with R&D Credit (WITH BRANCHING)
  -- ==================================================================================
  -- User: Ronan (CFO)
  -- Topic: FY2024 corporation tax with R&D credit claim
  -- Messages: 10 (main path: 6, branch path: 4 additional)
  -- Branching: User explores alternative R&D claim amount
  -- ==================================================================================

  -- Create conversation
  v_business_hours_offset := '-7 days 10:15:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv1_id,
    v_datatech_tenant_id,
    v_ronan_id,
    'Corporation Tax FY2024 with R&D Credit',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '45 minutes',
    v_now + v_business_hours_offset + INTERVAL '45 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  -- Create main conversation path
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    v_conv1_path_main,
    v_conv1_id,
    v_datatech_tenant_id,
    NULL,  -- Main path has no parent
    v_now + v_business_hours_offset,
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  -- Message 1: User question
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    'user',
    'Hi, I need to calculate our corporation tax liability for FY2024. We have trading income of €2.4M and qualifying R&D expenditure of €150K. What will our final tax liability be after the R&D credit?',
    v_now + v_business_hours_offset,
    1
  );

  -- Message 2: AI response
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    'assistant',
    E'For FY2024, your corporation tax calculation for DataTech Solutions would be:\n\n**Corporation Tax Calculation:**\n- Trading income: €2,400,000\n- Corporation tax rate: 12.5% (standard trading rate)\n- Gross CT liability: €2,400,000 × 12.5% = **€300,000**\n\n**R&D Tax Credit:**\n- Qualifying R&D expenditure: €150,000\n- R&D credit rate: 25%\n- R&D tax credit: €150,000 × 25% = **€37,500**\n\n**Final Tax Liability:**\n- Gross CT: €300,000\n- Less R&D credit: (€37,500)\n- **Net CT payable: €262,500**\n\nThe R&D credit is deducted from your corporation tax liability. If the credit exceeds your CT liability, the excess can be:\n1. Carried forward to future years, or\n2. Claimed as a refund (subject to certain conditions)\n\nWould you like me to explain the R&D credit claim process or qualifying expenditure categories?',
    v_now + v_business_hours_offset + INTERVAL '2 minutes',
    2
  );

  -- Message 3: Follow-up question
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    'user',
    'Yes, can you confirm what qualifies as R&D expenditure? We have software development costs, cloud infrastructure, and some external contractor fees.',
    v_now + v_business_hours_offset + INTERVAL '5 minutes',
    3
  );

  -- Message 4: AI response
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    'assistant',
    E'For Irish R&D tax credit purposes, qualifying expenditure includes:\n\n**✅ Qualifying Expenditure:**\n\n1. **Employee costs:**\n   - Salaries of staff directly engaged in R&D\n   - Employer PRSI contributions\n   - Pension contributions\n   - Must be directly attributable to R&D activities\n\n2. **Overhead costs:**\n   - 5% uplift on direct employee costs (no receipts needed)\n\n3. **Plant and machinery:**\n   - Capital expenditure on equipment used for R&D\n   - Must be used solely or mainly for R&D\n\n4. **External contractor fees:**\n   - Payments to third parties for R&D services\n   - **Important:** Only eligible if contractor is also Irish tax resident\n   - EU/EEA contractors may qualify under certain conditions\n\n5. **Consumable materials:**\n   - Materials directly used in R&D activities\n\n**❌ Non-Qualifying Expenditure:**\n- Cloud infrastructure costs (unless directly attributable to R&D project)\n- General software licenses\n- Marketing and sales activities\n- Non-R&D administrative overhead\n- Interest payments\n\n**For your specific items:**\n- ✅ Software development costs: YES (if developing new/improved products)\n- ❌ Cloud infrastructure: Generally NO (unless specific R&D hosting)\n- ✅/❌ External contractors: YES if Irish resident, NO if offshore\n\nRevenue requires detailed records showing:\n1. What R&D activities were undertaken\n2. How they meet the definition of R&D (scientific/technological uncertainty)\n3. Time records for staff involved\n4. Invoices and payment records\n\nWould you like guidance on documenting your R&D claim?',
    v_now + v_business_hours_offset + INTERVAL '8 minutes',
    4
  );

  -- Message 5: User satisfaction
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    'user',
    'That''s very helpful. Our contractors are in Poland, so sounds like we can''t claim those costs. I''ll review our documentation with the technical team.',
    v_now + v_business_hours_offset + INTERVAL '12 minutes',
    5
  );

  -- Message 6: AI closing
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    'assistant',
    E'Correct - Polish contractors won''t qualify unless they have an Irish establishment. \n\nFor your R&D claim documentation, ensure you have:\n- Technical reports describing the R&D projects\n- Time sheets showing staff allocation to R&D\n- Project plans and progress reports\n- Evidence of scientific/technological uncertainty being resolved\n\nRevenue''s R&D Manual provides detailed guidance on acceptable documentation standards. Let me know if you need help preparing the technical description for your claim form.',
    v_now + v_business_hours_offset + INTERVAL '15 minutes',
    6
  );

  -- ==================================================================================
  -- BRANCHING PATH: What if we claim €200K instead of €150K?
  -- ==================================================================================
  -- Create branch path (branches from message 2)
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    v_conv1_path_branch,
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_main,
    v_now + v_business_hours_offset + INTERVAL '20 minutes',
    NULL  -- Branches after message 2
  ) ON CONFLICT (id) DO NOTHING;

  -- Branch message 3: Alternative question
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_branch,
    'user',
    'Actually, can you recalculate assuming we claim €200K in R&D expenditure instead? I want to see if we can include more categories.',
    v_now + v_business_hours_offset + INTERVAL '20 minutes',
    3
  );

  -- Branch message 4: AI recalculation
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_branch,
    'assistant',
    E'**Revised Calculation with €200K R&D Expenditure:**\n\n**Corporation Tax Calculation:**\n- Trading income: €2,400,000\n- Corporation tax rate: 12.5%\n- Gross CT liability: **€300,000** (unchanged)\n\n**Enhanced R&D Tax Credit:**\n- Qualifying R&D expenditure: €200,000\n- R&D credit rate: 25%\n- R&D tax credit: €200,000 × 25% = **€50,000**\n\n**Final Tax Liability:**\n- Gross CT: €300,000\n- Less R&D credit: (€50,000)\n- **Net CT payable: €250,000**\n\n**Comparison with €150K claim:**\n- €150K R&D → €37,500 credit → €262,500 CT payable\n- €200K R&D → €50,000 credit → €250,000 CT payable\n- **Additional benefit: €12,500 tax saving**\n\nTo justify the higher €200K claim, you would need to demonstrate additional qualifying expenditure of €50K. This might include:\n- More staff time allocated to R&D projects\n- Additional qualifying equipment purchases\n- Higher overhead uplift (if base employee costs increased)\n\nRevenue will scrutinize claims carefully, so ensure all additional expenditure is well-documented and genuinely qualifies under R&D guidelines.',
    v_now + v_business_hours_offset + INTERVAL '23 minutes',
    4
  );

  -- Branch message 5: User follow-up
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_branch,
    'user',
    'The additional €50K would come from including more of our senior engineers'' time. Is there a risk Revenue would challenge this?',
    v_now + v_business_hours_offset + INTERVAL '28 minutes',
    5
  );

  -- Branch message 6: AI risk assessment
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_datatech_tenant_id,
    v_conv1_path_branch,
    'assistant',
    E'**Risk Assessment for Higher R&D Claim:**\n\nIncluding more senior engineering time is legitimate if:\n\n✅ **Lower Risk Factors:**\n- Engineers are working on projects with genuine scientific/technological uncertainty\n- You have detailed time sheets showing allocation to specific R&D projects\n- Projects involve developing new algorithms, innovative features, or solving technical challenges\n- Clear distinction between R&D work and routine software maintenance/support\n\n❌ **Higher Risk Factors (Revenue may challenge):**\n- Including time for routine bug fixes or standard feature development\n- Claiming entire salaries without detailed time allocation\n- Vague project descriptions that don''t demonstrate uncertainty\n- Lack of contemporaneous time records\n\n**Revenue Audit Triggers:**\n- Claims above 15% of total staff costs (yours: €200K claim / €2.4M income = 8.3% - relatively safe)\n- Sudden year-on-year increases without clear justification\n- High proportion of senior management time claimed\n\n**Recommendation:**\nIf you have robust time tracking and technical documentation, claiming €200K is defensible. However, I''d recommend:\n1. Conducting an internal review of time records\n2. Ensuring technical descriptions meet Revenue''s standards\n3. Considering a pre-filing consultation with Revenue if concerned\n\nThe incremental €12.5K tax saving is significant, but not worth the risk of a full Revenue audit if documentation is weak.',
    v_now + v_business_hours_offset + INTERVAL '35 minutes',
    6
  );

  -- ==================================================================================
  -- CONVERSATION 2: VAT on SaaS Sales to EU Customers
  -- ==================================================================================
  -- User: Siobhan (Finance Director)
  -- Topic: VAT treatment for SaaS sales to different customer types
  -- Messages: 8 (no branching)
  -- ==================================================================================

  v_business_hours_offset := '-5 days 14:30:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv2_id,
    v_datatech_tenant_id,
    v_siobhan_id,
    'VAT on SaaS Sales to EU Customers',
    v_now + v_business_hours_offset,
    v_now + v_business_hours_offset + INTERVAL '25 minutes',
    v_now + v_business_hours_offset + INTERVAL '25 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  -- Create conversation path
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    NULL,
    v_now + v_business_hours_offset,
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'We''re selling our SaaS platform to healthcare providers across the EU. I''m confused about VAT - do we charge Irish VAT to all customers, or does it vary by country?',
    v_now + v_business_hours_offset,
    1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'VAT on SaaS (Software-as-a-Service) follows specific rules depending on whether your customer is a business (B2B) or a consumer (B2C):\n\n**B2B Sales (Business Customers with Valid VAT Number):**\n- 🌍 **Place of supply:** Customer''s country (reverse charge mechanism)\n- 🧾 **VAT rate:** 0% (you don''t charge VAT)\n- 📋 **Customer''s obligation:** Customer accounts for VAT in their own country\n- ✅ **Your obligation:** \n  - Verify customer''s VAT number via VIES system\n  - Include on invoice: "Reverse charge - VAT accounted for by recipient"\n  - Report on VIES return (Intrastat if over €635K threshold)\n\n**B2C Sales (Consumers / Businesses without VAT Number):**\n- 🌍 **Place of supply:** Customer''s country (where they are established/reside)\n- 🧾 **VAT rate:** Customer''s country VAT rate (e.g., Germany 19%, France 20%)\n- 📋 **Your obligation:**\n  - Register for VAT in each EU country OR\n  - Use VAT MOSS (Mini One-Stop Shop) scheme\n- 💰 **VAT MOSS:** Allows you to register once in Ireland and file a single quarterly return covering all EU B2C sales\n\n**Non-EU Sales:**\n- 🌍 **Place of supply:** Outside EU VAT scope\n- 🧾 **VAT rate:** 0% (export of services)\n- 📋 **Your obligation:** Keep evidence of customer location\n\n**Which applies to healthcare providers?**\nMost healthcare providers are VAT-registered businesses, so B2B rules apply. You would:\n1. Verify their VAT number\n2. Charge 0% VAT (reverse charge)\n3. They account for VAT in their country\n\nDo your customers have VAT registration numbers?',
    v_now + v_business_hours_offset + INTERVAL '3 minutes',
    2
  );

  -- Message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'Most of them do have VAT numbers, but we also have some small private clinics that don''t. How do we handle the mixed customer base?',
    v_now + v_business_hours_offset + INTERVAL '7 minutes',
    3
  );

  -- Message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'For a mixed customer base, you need to handle B2B and B2C separately:\n\n**B2B Customers (with VAT number):**\n✅ Current process works fine:\n- Verify VAT number via VIES at sign-up\n- Charge 0% VAT\n- Invoice shows "Reverse charge"\n- Customer self-accounts for VAT\n\n**B2C Customers (without VAT number / small clinics):**\n📊 **Option 1: VAT MOSS (Recommended for most SaaS):**\n- Register for VAT MOSS in Ireland (one-time setup)\n- Charge customer''s local VAT rate on each invoice\n- File quarterly MOSS return listing all EU B2C sales\n- Pay all VAT to Irish Revenue (they distribute to other countries)\n- **Threshold:** No minimum - required for any B2C sales\n- **Benefit:** No need to register in 26 other EU countries\n\n📊 **Option 2: VAT OSS (One-Stop Shop - new from 2021):**\n- Similar to MOSS but also covers non-EU suppliers\n- Single registration, quarterly returns\n- Covers both goods and services\n\n**Practical Implementation:**\n1. **At customer sign-up:**\n   - Ask: "Do you have an EU VAT number?"\n   - If YES → Verify via VIES → B2B treatment (0% VAT)\n   - If NO → B2C treatment (local VAT rate)\n\n2. **Invoicing system:**\n   - B2B: Invoice shows "Reverse charge - VAT to be accounted for by recipient"\n   - B2C: Invoice shows VAT at customer''s country rate (e.g., "VAT @ 19% (Germany): €190")\n\n3. **VAT returns:**\n   - Irish VAT return: Includes B2B EU sales in Box E1 (zero-rated)\n   - VIES return: Lists B2B customers (quarterly)\n   - MOSS return: Lists B2C sales by country (quarterly)\n\n**Important:** Your billing system needs to:\n- Store customer VAT numbers\n- Determine customer location (IP address, billing address)\n- Apply correct VAT rate based on location\n- Generate compliant invoices\n\nDo you have billing software that handles multi-country VAT rates?',
    v_now + v_business_hours_offset + INTERVAL '12 minutes',
    4
  );

  -- Continue with more messages for conversation 2...
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'We use Stripe for billing. Does it handle VAT MOSS automatically?',
    v_now + v_business_hours_offset + INTERVAL '16 minutes',
    5
  );

  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_datatech_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'**Stripe and VAT Handling:**\n\nStripe provides good VAT support through **Stripe Tax**, but it doesn''t file MOSS returns automatically. Here''s what Stripe does and doesn''t do:\n\n✅ **What Stripe Tax handles:**\n- Determines customer location (IP address + billing address)\n- Applies correct VAT rate for each country\n- Validates EU VAT numbers via VIES\n- Generates VAT-compliant invoices\n- Provides VAT reports broken down by country\n- Calculates reverse charge scenarios\n\n❌ **What you still need to do:**\n- Register for VAT MOSS with Irish Revenue (one-time)\n- Download Stripe''s VAT report each quarter\n- File MOSS return on ROS (Revenue Online Service)\n- Pay VAT collected to Revenue\n- File VIES return for B2B sales\n\n**Setup Steps:**\n\n1. **Enable Stripe Tax:**\n   - Dashboard → Settings → Tax\n   - Enable "Collect tax automatically"\n   - Configure tax registration (Ireland + MOSS)\n\n2. **Configure VAT settings:**\n   - Set default tax code for SaaS: "txcd_10000000" (electronically supplied services)\n   - Enable reverse charge for B2B\n   - Set VAT number validation to "required for businesses"\n\n3. **Quarterly MOSS Filing:**\n   - Download Stripe Tax report (by country)\n   - Login to ROS → MOSS Return\n   - Enter sales and VAT for each EU country\n   - Pay total VAT due\n\n**Alternative Solutions:**\n- **Quaderno:** Integrates with Stripe, can auto-file MOSS returns\n- **Taxamo:** Similar to Quaderno\n- **Avalara:** Enterprise solution with full automation\n\nFor your scale (€12M ARR), I''d recommend:\n- Start with Stripe Tax + manual MOSS filing (cost-effective)\n- If B2C sales grow significantly, consider Quaderno for automation\n\nWould you like help with the MOSS registration process?',
    v_now + v_business_hours_offset + INTERVAL '20 minutes',
    6
  );

  RAISE NOTICE '✅ Created DataTech Finance conversations';
  RAISE NOTICE '   - Conversation 1: Corporation Tax with R&D (10 messages, 2 paths)';
  RAISE NOTICE '   - Conversation 2: VAT on SaaS Sales (6 messages, 1 path)';
  RAISE NOTICE '   - More conversations to be added...';

END $$;
