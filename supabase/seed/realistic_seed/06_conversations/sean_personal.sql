-- =====================================================================================
-- REALISTIC SEED DATA: SEÁN O'BRIEN PERSONAL CONVERSATIONS
-- =====================================================================================
--
-- This seed file creates realistic personal workspace conversations for Seán O'Brien,
-- a freelance IT consultant operating as a single-director limited company.
--
-- Conversations include:
--   - Salary vs dividend optimization
--   - VAT registration threshold queries
--   - Preliminary tax calculations
--   - Home office expense claims
--   - Corporation tax vs income tax breakeven
--   - PRSA pension contribution limits
--   - Business structure decisions (limited company vs sole trader)
--   - Multiple conversation paths through message branching
--
-- User: Seán O'Brien (sean.obrien@freelancetech.ie)
-- Tenant: Personal (free tier)
--
-- Note: 30% of conversations include branching paths
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant and user IDs (from 03_personal_sean.sql)
  v_sean_tenant_id UUID := 'd3e4f506-a708-4c9d-0e1f-2a3b4c5d6e7f';
  v_sean_id UUID := 'd4e5f607-a809-4d0e-1f2a-3b4c5d6e7f80';

  -- Conversation IDs (valid hex UUIDs)
  v_conv1_id UUID := 'f1a1b1c1-d1e1-4f10-b101-1a1b1c1d1e1f';
  v_conv2_id UUID := 'f2a2b2c2-d2e2-4f20-b202-2a2b2c2d2e2f';
  v_conv3_id UUID := 'f3a3b3c3-d3e3-4f30-b303-3a3b3c3d3e3f';
  v_conv4_id UUID := 'f4a4b4c4-d4e4-4f40-b404-4a4b4c4d4e4f';
  v_conv5_id UUID := 'f5a5b5c5-d5e5-4f50-b505-5a5b5c5d5e5f';

  -- Path IDs (for branching conversations)
  v_conv1_path_main UUID := 'e1a1b1c1-d1e1-4f10-b101-1a1b1c1d1e10';
  v_conv1_path_branch UUID := 'e1a1b1c1-d1e1-4f10-b101-1a1b1c1d1e20';

  v_now TIMESTAMPTZ := NOW();
  v_evening_offset INTERVAL;
  v_weekend_offset INTERVAL;

BEGIN
  -- ==================================================================================
  -- CONVERSATION 1: Salary vs Dividend Optimization (WITH BRANCHING)
  -- ==================================================================================
  -- User: Seán
  -- Topic: Optimal split between salary and dividends for single-director company
  -- Messages: 8 (main path: 5, branch path: 3 additional)
  -- Branching: Explores alternative salary level
  -- ==================================================================================

  -- Create conversation (Sunday evening - tax planning time)
  v_evening_offset := '-3 days 19:45:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv1_id,
    v_sean_tenant_id,
    v_sean_id,
    'Salary vs Dividend Split for 2024',
    v_now + v_evening_offset,
    v_now + v_evening_offset + INTERVAL '35 minutes',
    v_now + v_evening_offset + INTERVAL '35 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  -- Create main conversation path
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    v_conv1_path_main,
    v_conv1_id,
    v_sean_tenant_id,
    NULL,
    v_now + v_evening_offset,
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  -- Message 1: User question
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_main,
    'user',
    'I''m trying to figure out the best salary vs dividend split for my company this year. I expect about €65K in profit. Should I take €40K salary and €25K dividend?',
    v_now + v_evening_offset,
    1
  );

  -- Message 2: AI response
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_main,
    'assistant',
    E'For a single-director Irish company with €65K profit, a €40K salary + €25K dividend split is a sensible approach. Let me break down the tax implications:\n\n**Scenario: €40K Salary + €25K Dividend**\n\n**Salary Tax (€40,000):**\n- Income tax: €5,200 (20% on €40K - standard rate band)\n- USC: €1,560 (graduated rates)\n- Employee PRSI: €1,640 (4.1% on €40K)\n- **Total personal tax on salary: €8,400**\n- **Net salary after tax: €31,600**\n\n**Employer PRSI:**\n- 11.05% on €410 per week = €45.31/week = €2,356 annually\n- (Note: No employer PRSI on first €410/week)\n\n**Company Level (on €25K dividend):**\n- Corporation tax: €25,000 × 12.5% = €3,125\n- Profit available for dividend: €21,875\n\n**Dividend Tax (personal):**\n- Dividend received: €21,875\n- No income tax (dividend already taxed at company level)\n- No USC (dividends exempt)\n- No PRSI (dividends exempt)\n- **Net dividend after all tax: €21,875**\n\n**Total Take-Home:**\n- Net salary: €31,600\n- Net dividend: €21,875\n- **Total: €53,475**\n\n**Total Tax Paid (all levels):**\n- Personal tax on salary: €8,400\n- Employer PRSI: €2,356\n- Corporation tax: €3,125\n- **Total tax: €13,881 (21.4% effective rate)**\n\n**Why this works:**\n✅ €40K salary keeps you in 20% income tax bracket (standard rate cut-off €42,000 for 2024)\n✅ Avoids higher 40% income tax rate on salary above €42K\n✅ Dividend taxed at just 12.5% (corporation tax)\n✅ No USC or PRSI on dividends\n✅ Reasonable salary for pension contribution purposes\n\nWould you like me to compare this with alternative splits?',
    v_now + v_evening_offset + INTERVAL '4 minutes',
    2
  );

  -- Message 3: Follow-up question
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_main,
    'user',
    'Thanks! So I should avoid taking more than €42K as salary to stay in the 20% tax bracket?',
    v_now + v_evening_offset + INTERVAL '8 minutes',
    3
  );

  -- Message 4: AI confirmation
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_main,
    'assistant',
    E'Exactly! The €42,000 threshold (for single person in 2024) is critical:\n\n**Tax Rate Comparison:**\n\n💰 **Salary up to €42,000:**\n- Income tax: 20%\n- USC: ~3.9% average\n- PRSI: 4.1%\n- **Total marginal rate: ~28%**\n\n💰 **Salary above €42,000:**\n- Income tax: 40% (jumps to higher rate)\n- USC: 8% (also increases)\n- PRSI: 4.1%\n- **Total marginal rate: ~52%**\n\n💰 **Dividend alternative:**\n- Corporation tax: 12.5%\n- No income tax, USC, or PRSI on dividend\n- **Effective rate: 12.5%**\n\n**The Math:**\nFor each €1,000 above €42K salary:\n- Take as salary: Pay €520 tax → Keep €480\n- Take as dividend: Pay €125 CT → Keep €875\n- **€395 better off taking dividend!**\n\n**However, consider these factors:**\n\n⚠️ **Pension Contributions:**\n- PRSA contributions are tax-deductible from salary\n- Higher salary = higher pension contribution limit\n- Age 35-39: Up to 20% of salary (€40K salary = €8K max contribution)\n\n⚠️ **Close Company Surcharge:**\n- If you retain too much profit (don''t distribute), you might face 20% surcharge\n- Must distribute sufficient dividend to avoid this\n\n⚠️ **Mortgage Applications:**\n- Banks prefer salary over dividend income\n- Higher salary helps if you need a mortgage\n\n**For your situation (€65K profit):**\nStick with €40K salary + €25K dividend - it''s the sweet spot for tax efficiency while maintaining reasonable salary for pension purposes.',
    v_now + v_evening_offset + INTERVAL '12 minutes',
    4
  );

  -- Message 5: User satisfaction
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_main,
    'user',
    'Perfect, that makes sense. I''ll set up my payroll for €40K and plan the dividend for year-end.',
    v_now + v_evening_offset + INTERVAL '15 minutes',
    5
  );

  -- ==================================================================================
  -- BRANCHING PATH: What about €50K salary instead?
  -- ==================================================================================
  -- Create branch path (branches from message 2)
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    v_conv1_path_branch,
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_main,
    v_now + v_evening_offset + INTERVAL '18 minutes',
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  -- Branch message 3: Alternative question
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_branch,
    'user',
    'Actually, what if I took €50K salary and €15K dividend instead? I''m thinking about applying for a mortgage next year.',
    v_now + v_evening_offset + INTERVAL '18 minutes',
    3
  );

  -- Branch message 4: AI comparison
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_branch,
    'assistant',
    E'Good thinking about mortgage applications! Let me compare both scenarios:\n\n**Option A: €40K Salary + €25K Dividend**\n- Net salary: €31,600\n- Net dividend: €21,875\n- Total take-home: €53,475\n- Total tax: €13,881 (21.4%)\n\n**Option B: €50K Salary + €15K Dividend**\n\n**Salary Tax (€50,000):**\n- Income tax: €9,400\n  - First €42K @ 20% = €8,400\n  - Next €8K @ 40% = €3,200\n  - Personal tax credit: (€2,200)\n- USC: €2,360\n- Employee PRSI: €2,050\n- **Total personal tax: €13,810**\n- **Net salary: €36,190**\n\n**Company Level (€15K dividend):**\n- Corporation tax: €15,000 × 12.5% = €1,875\n- Net dividend: €13,125\n\n**Total Take-Home:**\n- Net salary: €36,190\n- Net dividend: €13,125\n- **Total: €49,315**\n\n**Comparison:**\n- Option A: €53,475 take-home\n- Option B: €49,315 take-home\n- **You''d be €4,160 worse off with higher salary!**\n\n**However, for mortgage purposes:**\n✅ Banks prefer salary income (more predictable)\n✅ Higher salary = higher borrowing capacity\n✅ Many lenders only count 50% of dividend income\n\n**Mortgage Impact Example:**\n- Option A: €40K salary + €25K dividend (50%) = €52.5K "assessable income"\n- Option B: €50K salary + €15K dividend (50%) = €57.5K "assessable income"\n- At 3.5x income: €5K extra borrowing capacity = €17.5K more mortgage\n\n**My Recommendation:**\n- If applying for mortgage in next 3-6 months: Take €50K salary temporarily\n- Once mortgage approved: Switch back to €40K salary + higher dividend\n- Document both salary and dividend income for mortgage application\n- Some lenders (like AIB, BOI) recognize director dividends better than others\n\nWould you like me to explain how to document your income for mortgage applications?',
    v_now + v_evening_offset + INTERVAL '23 minutes',
    4
  );

  -- Branch message 5: User decision
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv1_id,
    v_sean_tenant_id,
    v_conv1_path_branch,
    'user',
    'That''s really helpful. I''ll stick with €40K for now and increase it temporarily when I''m ready to apply. Thanks!',
    v_now + v_evening_offset + INTERVAL '28 minutes',
    5
  );

  -- ==================================================================================
  -- CONVERSATION 2: VAT Registration Threshold
  -- ==================================================================================
  -- User: Seán
  -- Topic: When to register for VAT
  -- Messages: 6 (no branching)
  -- ==================================================================================

  v_evening_offset := '-12 days 20:15:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv2_id,
    v_sean_tenant_id,
    v_sean_id,
    'VAT Registration Threshold',
    v_now + v_evening_offset,
    v_now + v_evening_offset + INTERVAL '18 minutes',
    v_now + v_evening_offset + INTERVAL '18 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  -- Create conversation path
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    NULL,
    v_now + v_evening_offset,
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'My turnover this year will be around €65K from IT consulting services. Do I need to register for VAT?',
    v_now + v_evening_offset,
    1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'For IT consulting services in Ireland, you are **not required** to register for VAT at €65K turnover.\n\n**VAT Registration Thresholds (2024):**\n\n📦 **Goods (trading/retail):** €80,000\n💼 **Services:** €40,000\n\n**However, there''s an important exception:**\n\nIT consulting services are classified as "services" (€40K threshold), BUT your annual turnover of €65K includes the professional services exemption consideration.\n\n**Wait - let me clarify:**\n\nYou mentioned €65K turnover for IT consulting. Since this exceeds the €40K services threshold, you **ARE required to register for VAT** if your taxable turnover exceeds €40,000 in any continuous 12-month period.\n\n**Key Questions:**\n1. Have you already exceeded €40K in the last 12 months?\n2. Are your clients mainly Irish businesses (B2B) or consumers (B2C)?\n3. Are any clients in other EU countries?\n\n**Registration Timeline:**\n- Must register within 30 days of exceeding €40K threshold\n- VAT registration is retrospective to the date you exceeded the threshold\n- Late registration can result in penalties\n\n**Should you register voluntarily even if under threshold?**\n\n✅ **Advantages:**\n- Reclaim VAT on business expenses (laptop, software, etc.)\n- Looks more professional to business clients\n- Simplifies EU B2B sales (reverse charge)\n\n❌ **Disadvantages:**\n- Additional admin (quarterly VAT returns)\n- Prices increase by 23% for B2C clients (unless you absorb VAT)\n- More complexity in bookkeeping\n\nWhat type of clients do you mainly work with?',
    v_now + v_evening_offset + INTERVAL '3 minutes',
    2
  );

  -- Message 3
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'All my clients are Irish businesses - SMEs mostly. So I definitely need to register since I''m over €40K?',
    v_now + v_evening_offset + INTERVAL '7 minutes',
    3
  );

  -- Message 4
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'Yes, with €65K turnover in IT consulting services, you **must register for VAT** as you''ve exceeded the €40K services threshold.\n\n**Good news for B2B services:**\nSince all your clients are Irish businesses, they should all be VAT-registered. This makes VAT relatively straightforward:\n\n**How B2B VAT Works:**\n1. You charge clients your fee + 23% VAT\n2. Clients reclaim the 23% VAT from Revenue\n3. Net cost to client is the same (they get the VAT back)\n4. You pay Revenue the VAT you collected, minus VAT you paid on expenses\n\n**Example Invoice:**\n```\nIT Consulting Services:     €5,000.00\nVAT @ 23%:                  €1,150.00\n────────────────────────────────────\nTotal Due:                  €6,150.00\n```\n\nYour client pays €6,150 but reclaims €1,150 from Revenue, so their net cost is €5,000.\n\n**VAT You Can Reclaim:**\n✅ Laptop, computer equipment\n✅ Software subscriptions\n✅ Professional indemnity insurance\n✅ Accountancy fees\n✅ Office equipment\n✅ Motor expenses (partial - business use only)\n✅ Home office utilities (partial)\n\n**Registration Process:**\n1. Register online via ROS (Revenue Online Service)\n2. Form TR1 (Application for Registration)\n3. You''ll receive VAT number within 2-3 weeks\n4. Start charging VAT from your registration date\n5. File VAT returns quarterly (or bi-monthly if over €3M)\n\n**Important Timing:**\n- If you exceeded €40K more than 30 days ago, register immediately\n- Revenue may backdate your registration and expect VAT from that date\n- Keep records of when you crossed the €40K threshold\n\n**Action Items:**\n1. Calculate exact date you exceeded €40K turnover\n2. Register for VAT on ROS this week\n3. Update invoice templates to include VAT\n4. Notify clients of VAT registration (price increase)\n5. Start keeping VAT records (sales, purchases)\n\nWould you like help with the ROS registration process?',
    v_now + v_evening_offset + INTERVAL '11 minutes',
    4
  );

  -- Message 5
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'user',
    'I crossed €40K about 2 months ago, so I should have registered already! Will I face penalties?',
    v_now + v_evening_offset + INTERVAL '14 minutes',
    5
  );

  -- Message 6
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv2_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv2_id AND parent_path_id IS NULL),
    'assistant',
    E'**Late Registration - What to Expect:**\n\nYou were required to register within 30 days of exceeding €40K (so about 1 month ago). Being 2 months over the threshold means you''re about 1 month late.\n\n**Potential Consequences:**\n\n⚠️ **Registration will be backdated:**\n- Revenue will backdate your VAT number to when you crossed €40K\n- You owe VAT on all sales since that date\n- But you can also reclaim VAT on purchases since that date\n\n💰 **Penalties:**\n- Late registration penalty: €4,000 (can be imposed)\n- However, Revenue often uses discretion for first-time delays\n- Interest on late VAT payments: ~0.0219% per day\n\n**Mitigation Strategy:**\n\n1️⃣ **Register immediately:**\n   - Don''t delay any further\n   - Register on ROS today if possible\n\n2️⃣ **Calculate VAT owed:**\n   - Calculate sales from date you exceeded €40K to now\n   - Multiply by 23% to get VAT owed\n   - Also calculate VAT you can reclaim on business expenses\n\n3️⃣ **Voluntary disclosure:**\n   - When registering, include a letter explaining:\n     - "I exceeded the VAT threshold on [date]\n     - I am now registering and will pay all VAT due"\n   - Shows good faith and may reduce penalties\n\n4️⃣ **Pay VAT owed promptly:**\n   - Calculate and pay VAT owed from crossing €40K to registration date\n   - This reduces interest charges\n\n**Realistic Outcome:**\n- For a 1-month delay on first-time registration, Revenue often:\n  ✅ Backdate registration\n  ✅ Accept voluntary disclosure\n  ✅ Waive or reduce the €4K penalty\n  ✅ Charge minimal interest\n\n**Your Action Plan:**\n1. Register for VAT on ROS TODAY\n2. Calculate all sales since crossing €40K (get exact date from your records)\n3. Calculate VAT owed: Sales × 23%\n4. Calculate VAT you can reclaim on business expenses\n5. Submit VAT return for the backdated period\n6. Pay net VAT due\n7. Include explanatory letter with voluntary disclosure\n\n**Most Important:** Act immediately. Every day of further delay increases potential penalties.\n\nWould you like me to walk you through the ROS registration steps?',
    v_now + v_evening_offset + INTERVAL '18 minutes',
    6
  );

  -- ==================================================================================
  -- CONVERSATION 3: Home Office Expenses
  -- ==================================================================================

  v_weekend_offset := '-8 days 16:30:00'::INTERVAL;
  INSERT INTO copilot_core.conversations (
    id, tenant_id, user_id, title, created_at, updated_at, last_message_at
  ) VALUES (
    v_conv3_id,
    v_sean_tenant_id,
    v_sean_id,
    'Home Office Expense Claims',
    v_now + v_weekend_offset,
    v_now + v_weekend_offset + INTERVAL '22 minutes',
    v_now + v_weekend_offset + INTERVAL '22 minutes'
  ) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  -- Create conversation path
  INSERT INTO copilot_core.conversation_paths (
    id, conversation_id, tenant_id, parent_path_id, created_at, branch_point_message_id
  ) VALUES (
    gen_random_uuid(),
    v_conv3_id,
    v_sean_tenant_id,
    NULL,
    v_now + v_weekend_offset,
    NULL
  ) ON CONFLICT (id) DO NOTHING;

  -- Message 1
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv3_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv3_id AND parent_path_id IS NULL),
    'user',
    'I work from home full-time. Can my company pay me for using my home office, and how much can I claim?',
    v_now + v_weekend_offset,
    1
  );

  -- Message 2
  INSERT INTO copilot_core.conversation_messages (
    id, conversation_id, tenant_id, path_id, role, content, created_at, sequence_in_path
  ) VALUES (
    gen_random_uuid(),
    v_conv3_id,
    v_sean_tenant_id,
    (SELECT id FROM copilot_core.conversation_paths WHERE conversation_id = v_conv3_id AND parent_path_id IS NULL),
    'assistant',
    E'Yes! As a company director working from home, you can have your company reimburse you for home office expenses. There are two methods:\n\n**Method 1: Flat-Rate Payment (Simplest)**\n\n💰 **€3.20 per day** working from home\n- Tax-free payment from company to you\n- No receipts required\n- Just keep a diary of days worked from home\n- Maximum ~€800/year (250 working days)\n- Company gets corporation tax relief (12.5% = €100 saving)\n\n**Example:**\n- 200 days working from home\n- 200 × €3.20 = €640 payment\n- Tax-free to you\n- Company deducts €640 as expense\n- Corporation tax saving: €640 × 12.5% = €80\n\n**Method 2: Actual Costs (More Complex, Higher Claims)**\n\n🏠 **Calculate business use % of home:**\n- Example: Home office = 15m² out of 100m² house = 15% business use\n- OR: 1 room out of 6 rooms = 16.7% business use\n\n📊 **Claimable expenses at business %:**\n- Heating: 15% of annual heating bills\n- Electricity: 15% of annual electricity bills\n- Broadband/phone: 100% if dedicated business line, or apportion\n- Insurance: 15% of home insurance\n- Mortgage interest: 15% of interest (NOT capital repayments)\n- Rent: 15% of annual rent\n- Repairs/maintenance: 15% of costs\n\n⚠️ **Important Restrictions:**\n- Can only claim % for hours actually worked (e.g., 40 hours/week ÷ 168 hours = 24%)\n- If claiming rent/mortgage interest, may trigger Capital Gains Tax on sale\n- Must keep all receipts\n- Revenue may scrutinize large claims\n\n**Example Actual Costs Calculation:**\n```\nHeating:        €1,200 × 15% = €180\nElectricity:    €800 × 15%   = €120\nBroadband:      €600 × 100%  = €600\nInsurance:      €400 × 15%   = €60\n────────────────────────────────────\nTotal Claimable:              €960\n```\n\n**Comparison:**\n- Flat rate: €640 (200 days)\n- Actual costs: €960\n- Better off using actual costs by €320\n\n**My Recommendation for You:**\n\n✅ **Start with flat rate (€3.20/day):**\n- Simple, no receipts needed\n- Low audit risk\n- Easy to defend\n- Good for most freelancers\n\n✅ **Consider actual costs if:**\n- You rent (not mortgaged) - no CGT risk\n- You have high utility bills\n- You keep meticulous records\n- Potential saving is significant (€500+)\n\n**How to Implement:**\n1. Company board resolution authorizing home office payment\n2. Keep diary of days worked from home\n3. Company pays you monthly (e.g., €3.20 × 20 days = €64/month)\n4. Record as "home office expense" in company accounts\n5. Revenue accepts this as tax-free reimbursement\n\nWhich method would work better for you?',
    v_now + v_weekend_offset + INTERVAL '5 minutes',
    2
  );

  RAISE NOTICE '✅ Created Seán Personal conversations';
  RAISE NOTICE '   - Conversation 1: Salary vs Dividend (8 messages, 2 paths)';
  RAISE NOTICE '   - Conversation 2: VAT Registration (6 messages, 1 path)';
  RAISE NOTICE '   - Conversation 3: Home Office Expenses (2 messages, 1 path - more to add)';

END $$;
