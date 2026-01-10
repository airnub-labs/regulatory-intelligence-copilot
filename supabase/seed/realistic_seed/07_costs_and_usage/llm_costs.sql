-- =====================================================================================
-- REALISTIC SEED DATA: LLM COST TRACKING
-- =====================================================================================
--
-- This seed file creates realistic LLM API cost records for conversations.
--
-- Cost patterns:
--   - Enterprise (DataTech): Higher token usage, premium models (Claude Sonnet, GPT-4)
--   - Pro (Emerald Tax): Moderate usage, mixed models
--   - Personal (Seán): Lower usage, cost-conscious models (Claude Haiku, GPT-3.5)
--
-- Model selection based on query complexity:
--   - Complex tax calculations: Claude 3.5 Sonnet, GPT-4 Turbo
--   - Standard queries: GPT-4o, Claude 3 Haiku
--   - Simple lookups: GPT-3.5 Turbo, Gemini Flash
--
-- =====================================================================================

DO $$
DECLARE
  -- Tenant IDs
  v_datatech_tenant_id UUID := 'b1e5c3d7-4f9a-4b6e-8c2d-1a3e5f7b9d2c';
  v_sean_tenant_id UUID := 'd3e4f506-a708-4c9d-0e1f-2a3b4c5d6e7f';

  -- User IDs
  v_ronan_id UUID := 'a2b3c4d5-e6f7-4b8c-9d0e-1f2a3b4c5d6e';  -- DataTech CFO
  v_siobhan_id UUID := 'a3b4c5d6-e7f8-4c9d-0e1f-2a3b4c5d6e7f';  -- Finance Director
  v_orla_id UUID := 'a8b9c0d1-e2f3-4b4c-5d6e-7f8091021324';  -- HR Director
  v_sinead_id UUID := 'a9b0c1d2-e3f4-4c5d-6e7f-8091021324a5';  -- HR Manager
  v_liam_id UUID := 'a6b7c8d9-e0f1-4f2a-3b4c-5d6e7f809102';  -- CTO
  v_sean_id UUID := 'd4e5f607-a809-4d0e-1f2a-3b4c5d6e7f80';  -- Seán

  -- Conversation IDs
  v_finance_conv1_id UUID := 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';  -- Corp tax R&D
  v_finance_conv2_id UUID := 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c';  -- VAT SaaS
  v_hr_conv1_id UUID := 'a1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';  -- Company car BIK
  v_hr_conv2_id UUID := 'a2a2b2c2-d2e2-4f2a-2b2c-2d2e2f2a2b2c';  -- KEEP options
  v_hr_conv3_id UUID := 'a3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b3c';  -- Maternity
  v_sean_conv1_id UUID := 'b1a1b1c1-d1e1-4f1a-1b1c-1d1e1f1a1b1c';  -- Salary dividend
  v_sean_conv2_id UUID := 'b2a2b2c2-d2e2-4f2a-2b2c-2d2e2f2a2b2c';  -- VAT registration
  v_sean_conv3_id UUID := 'b3a3b3c3-d3e3-4f3a-3b3c-3d3e3f3a3b3c';  -- Home office

  v_now TIMESTAMPTZ := NOW();

BEGIN
  -- ==================================================================================
  -- DATATECH FINANCE - Corporation Tax with R&D Credit (Complex calculation)
  -- ==================================================================================
  -- Model: Claude 3.5 Sonnet (complex financial calculation)
  -- Total messages: 10 (main path: 6, branch path: 4)
  -- ==================================================================================

  -- Message 1: User question (input tokens)
  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
    'anthropic', 'claude-3-5-sonnet-20241022',
    450, 0, 450,  -- User question + system prompt
    0.00135, 0.00000, 0.00135,  -- $3.00 per million input
    v_now - INTERVAL '7 days 10:15:00'
  );

  -- Message 2: AI response (output tokens)
  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
    'anthropic', 'claude-3-5-sonnet-20241022',
    500, 1850, 2350,  -- Context + detailed tax calculation response
    0.00150, 0.02775, 0.02925,  -- $15.00 per million output
    v_now - INTERVAL '7 days 10:17:00'
  );

  -- Message 3-6: Continued conversation
  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 650, 0, 650, 0.00195, 0.00000, 0.00195,
     v_now - INTERVAL '7 days 10:20:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 700, 2100, 2800, 0.00210, 0.03150, 0.03360,
     v_now - INTERVAL '7 days 10:23:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 750, 0, 750, 0.00225, 0.00000, 0.00225,
     v_now - INTERVAL '7 days 10:27:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 800, 950, 1750, 0.00240, 0.01425, 0.01665,
     v_now - INTERVAL '7 days 10:30:00');

  -- Branch path messages (alternative R&D calculation)
  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 550, 0, 550, 0.00165, 0.00000, 0.00165,
     v_now - INTERVAL '7 days 10:35:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_ronan_id, v_finance_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 600, 1680, 2280, 0.00180, 0.02520, 0.02700,
     v_now - INTERVAL '7 days 10:38:00');

  -- Total for conversation 1: ~$0.15 USD

  -- ==================================================================================
  -- DATATECH FINANCE - VAT on SaaS Sales
  -- ==================================================================================
  -- Model: GPT-4o (standard complexity, good for multi-country VAT rules)
  -- ==================================================================================

  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_datatech_tenant_id, v_siobhan_id, v_finance_conv2_id,
     'openai', 'gpt-4o-2024-05-13', 420, 0, 420, 0.00210, 0.00000, 0.00210,
     v_now - INTERVAL '5 days 14:30:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_siobhan_id, v_finance_conv2_id,
     'openai', 'gpt-4o-2024-05-13', 480, 1520, 2000, 0.00240, 0.02280, 0.02520,
     v_now - INTERVAL '5 days 14:33:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_siobhan_id, v_finance_conv2_id,
     'openai', 'gpt-4o-2024-05-13', 520, 0, 520, 0.00260, 0.00000, 0.00260,
     v_now - INTERVAL '5 days 14:37:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_siobhan_id, v_finance_conv2_id,
     'openai', 'gpt-4o-2024-05-13', 580, 1850, 2430, 0.00290, 0.02775, 0.03065,
     v_now - INTERVAL '5 days 14:42:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_siobhan_id, v_finance_conv2_id,
     'openai', 'gpt-4o-2024-05-13', 620, 0, 620, 0.00310, 0.00000, 0.00310,
     v_now - INTERVAL '5 days 14:46:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_siobhan_id, v_finance_conv2_id,
     'openai', 'gpt-4o-2024-05-13', 680, 1240, 1920, 0.00340, 0.01860, 0.02200,
     v_now - INTERVAL '5 days 14:50:00');

  -- Total for conversation 2: ~$0.11 USD

  -- ==================================================================================
  -- DATATECH HR - Company Car BIK
  -- ==================================================================================
  -- Model: Claude 3.5 Sonnet (detailed tax calculation)
  -- ==================================================================================

  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_datatech_tenant_id, v_orla_id, v_hr_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 380, 0, 380, 0.00114, 0.00000, 0.00114,
     v_now - INTERVAL '4 days 11:20:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_orla_id, v_hr_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 440, 1950, 2390, 0.00132, 0.02925, 0.03057,
     v_now - INTERVAL '4 days 11:25:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_orla_id, v_hr_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 500, 0, 500, 0.00150, 0.00000, 0.00150,
     v_now - INTERVAL '4 days 11:29:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_orla_id, v_hr_conv1_id,
     'anthropic', 'claude-3-5-sonnet-20241022', 560, 2350, 2910, 0.00168, 0.03525, 0.03693,
     v_now - INTERVAL '4 days 11:35:00');

  -- Total for conversation: ~$0.10 USD

  -- ==================================================================================
  -- DATATECH HR - KEEP Share Options
  -- ==================================================================================
  -- Model: GPT-4 Turbo (complex legal/tax analysis)
  -- ==================================================================================

  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_datatech_tenant_id, v_liam_id, v_hr_conv2_id,
     'openai', 'gpt-4-turbo-2024-04-09', 420, 0, 420, 0.00420, 0.00000, 0.00420,
     v_now - INTERVAL '9 days 15:30:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_liam_id, v_hr_conv2_id,
     'openai', 'gpt-4-turbo-2024-04-09', 480, 2820, 3300, 0.00480, 0.08460, 0.08940,
     v_now - INTERVAL '9 days 15:38:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_liam_id, v_hr_conv2_id,
     'openai', 'gpt-4-turbo-2024-04-09', 650, 0, 650, 0.00650, 0.00000, 0.00650,
     v_now - INTERVAL '9 days 15:45:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_liam_id, v_hr_conv2_id,
     'openai', 'gpt-4-turbo-2024-04-09', 720, 2650, 3370, 0.00720, 0.07950, 0.08670,
     v_now - INTERVAL '9 days 15:55:00');

  -- Branch path (ESOP alternative)
  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_datatech_tenant_id, v_liam_id, v_hr_conv2_id,
     'openai', 'gpt-4-turbo-2024-04-09', 580, 0, 580, 0.00580, 0.00000, 0.00580,
     v_now - INTERVAL '9 days 16:00:00'),
    (gen_random_uuid(), v_datatech_tenant_id, v_liam_id, v_hr_conv2_id,
     'openai', 'gpt-4-turbo-2024-04-09', 650, 2480, 3130, 0.00650, 0.07440, 0.08090,
     v_now - INTERVAL '9 days 16:08:00');

  -- Total for conversation: ~$0.36 USD

  -- ==================================================================================
  -- SEÁN PERSONAL - Salary vs Dividend (Cost-conscious usage)
  -- ==================================================================================
  -- Model: Claude 3 Haiku (cost-effective for standard queries)
  -- ==================================================================================

  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'anthropic', 'claude-3-haiku-20240307', 320, 0, 320, 0.00008, 0.00000, 0.00008,
     v_now - INTERVAL '3 days 19:45:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'anthropic', 'claude-3-haiku-20240307', 380, 1450, 1830, 0.00010, 0.00181, 0.00191,
     v_now - INTERVAL '3 days 19:49:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'anthropic', 'claude-3-haiku-20240307', 420, 0, 420, 0.00011, 0.00000, 0.00011,
     v_now - INTERVAL '3 days 19:53:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'anthropic', 'claude-3-haiku-20240307', 480, 1280, 1760, 0.00012, 0.00160, 0.00172,
     v_now - INTERVAL '3 days 19:57:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'anthropic', 'claude-3-haiku-20240307', 520, 0, 520, 0.00013, 0.00000, 0.00013,
     v_now - INTERVAL '3 days 20:00:00');

  -- Branch path (mortgage scenario) - upgrades to GPT-4o for complex comparison
  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'openai', 'gpt-4o-2024-05-13', 480, 0, 480, 0.00240, 0.00000, 0.00240,
     v_now - INTERVAL '3 days 20:03:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'openai', 'gpt-4o-2024-05-13', 540, 1680, 2220, 0.00270, 0.02520, 0.02790,
     v_now - INTERVAL '3 days 20:08:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv1_id,
     'openai', 'gpt-4o-2024-05-13', 600, 0, 600, 0.00300, 0.00000, 0.00300,
     v_now - INTERVAL '3 days 20:13:00');

  -- Total for conversation: ~$0.04 USD (mostly Haiku, one GPT-4o for complex branch)

  -- ==================================================================================
  -- SEÁN PERSONAL - VAT Registration
  -- ==================================================================================
  -- Model: GPT-3.5 Turbo (simple factual query)
  -- ==================================================================================

  INSERT INTO copilot_billing.llm_cost_records (
    id, tenant_id, user_id, conversation_id, provider, model,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    created_at
  ) VALUES
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv2_id,
     'openai', 'gpt-3.5-turbo', 290, 0, 290, 0.00015, 0.00000, 0.00015,
     v_now - INTERVAL '12 days 20:15:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv2_id,
     'openai', 'gpt-3.5-turbo', 340, 980, 1320, 0.00017, 0.00147, 0.00164,
     v_now - INTERVAL '12 days 20:18:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv2_id,
     'openai', 'gpt-3.5-turbo', 380, 0, 380, 0.00019, 0.00000, 0.00019,
     v_now - INTERVAL '12 days 20:22:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv2_id,
     'openai', 'gpt-3.5-turbo', 420, 1450, 1870, 0.00021, 0.00218, 0.00239,
     v_now - INTERVAL '12 days 20:26:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv2_id,
     'openai', 'gpt-3.5-turbo', 460, 0, 460, 0.00023, 0.00000, 0.00023,
     v_now - INTERVAL '12 days 20:29:00'),
    (gen_random_uuid(), v_sean_tenant_id, v_sean_id, v_sean_conv2_id,
     'openai', 'gpt-3.5-turbo', 500, 1680, 2180, 0.00025, 0.00252, 0.00277,
     v_now - INTERVAL '12 days 20:33:00');

  -- Total for conversation: ~$0.007 USD (very cost-effective)

  RAISE NOTICE '✅ Created LLM cost tracking records';
  RAISE NOTICE '   DataTech Finance (2 convs): ~$0.26 USD';
  RAISE NOTICE '   DataTech HR (2 convs): ~$0.46 USD';
  RAISE NOTICE '   Seán Personal (2 convs): ~$0.047 USD';
  RAISE NOTICE '   Total: ~$0.77 USD for 8 conversations';
  RAISE NOTICE '   Enterprise using premium models (Sonnet, GPT-4), Personal using cost-effective models (Haiku, GPT-3.5)';

END $$;
