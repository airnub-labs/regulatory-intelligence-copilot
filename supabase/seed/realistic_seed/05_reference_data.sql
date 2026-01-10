-- =====================================================================================
-- REALISTIC SEED DATA: REFERENCE DATA (PERSONAS, QUICK PROMPTS, PRICING)
-- =====================================================================================
--
-- This seed file creates reference data used across the platform:
--   - Personas (user archetypes for context-aware assistance)
--   - Quick Prompts (commonly used queries for different personas)
--   - Model Pricing (LLM provider pricing configurations)
--
-- =====================================================================================

DO $$
BEGIN
  -- ==================================================================================
  -- 1. SEED PERSONAS
  -- ==================================================================================

  INSERT INTO copilot_core.personas (id, label, description, jurisdictions) VALUES
    ('single-director-ie', 'Single-director Irish company', 'Owner-director of a single-director Irish limited company – PAYE, PRSI, CT, pensions and CGT interactions.', ARRAY['IE']),
    ('sole-trader-ie', 'Irish sole trader', 'Self-employed individual trading under own name – income tax, USC, VAT, self-assessment.', ARRAY['IE']),
    ('partnership-ie', 'Irish partnership', 'Trading partnership (2+ partners) – partnership taxation, partner drawings, capital allowances.', ARRAY['IE']),
    ('sme-finance-director', 'SME Finance Director', 'Finance professional in Irish SME – payroll, VAT, corporation tax compliance, R&D credits.', ARRAY['IE']),
    ('tax-consultant-ie', 'Irish tax consultant', 'Chartered tax advisor serving multiple clients – complex tax positions, Appeals Commissioner cases.', ARRAY['IE']),
    ('uk-limited-company', 'UK limited company director', 'Director of UK private limited company – corporation tax, PAYE, NI, dividends.', ARRAY['GB']),
    ('eu-cross-border', 'EU cross-border trader', 'Business operating across EU member states – VAT MOSS, intra-community supply, transfer pricing.', ARRAY['IE', 'GB', 'EU'])
  ON CONFLICT (id) DO UPDATE
    SET label = EXCLUDED.label,
        description = EXCLUDED.description,
        jurisdictions = EXCLUDED.jurisdictions;

  RAISE NOTICE 'Created/updated % personas', 7;

  -- ==================================================================================
  -- 2. SEED QUICK PROMPTS
  -- ==================================================================================

  INSERT INTO copilot_core.quick_prompts (
    id,
    label,
    prompt,
    scenario_hint,
    persona_filter,
    jurisdictions
  ) VALUES
    -- Single-director company prompts
    ('paye_prsi_single_director', 'PAYE vs PRSI for single-director', 'Explain how PAYE and PRSI interact for a single-director Irish company with salary + dividends.', 'paye_prsi_single_director', ARRAY['single-director-ie'], ARRAY['IE']),
    ('director_salary_dividend_split', 'Optimal salary vs dividend split', 'What is the optimal split between salary and dividends for a single-director Irish company to minimize tax?', 'director_salary_dividend_split', ARRAY['single-director-ie'], ARRAY['IE']),
    ('close_company_surcharge', 'Close company surcharge', 'Explain the close company surcharge and how to avoid it through distributions.', 'close_company_surcharge', ARRAY['single-director-ie'], ARRAY['IE']),

    -- Sole trader prompts
    ('sole_trader_vat_threshold', 'VAT registration threshold', 'When must an Irish sole trader register for VAT? What are the thresholds for goods vs services?', 'sole_trader_vat_threshold', ARRAY['sole-trader-ie'], ARRAY['IE']),
    ('home_office_expenses', 'Home office expense claims', 'How can I claim home office expenses as a sole trader? Percentage method vs actual costs?', 'home_office_expenses', ARRAY['sole-trader-ie', 'single-director-ie'], ARRAY['IE']),
    ('preliminary_tax_calculation', 'Preliminary tax due dates', 'Explain preliminary tax calculation and payment dates for a sole trader.', 'preliminary_tax_calculation', ARRAY['sole-trader-ie'], ARRAY['IE']),

    -- SME Finance prompts
    ('r_and_d_tax_credit', 'R&D tax credit claim', 'How do I claim the R&D tax credit for our software development company?', 'r_and_d_tax_credit', ARRAY['sme-finance-director', 'single-director-ie'], ARRAY['IE']),
    ('payroll_employer_prsi', 'Employer PRSI rates', 'What are the current employer PRSI rates and thresholds?', 'payroll_employer_prsi', ARRAY['sme-finance-director'], ARRAY['IE']),
    ('vat_saas_eu_sales', 'VAT on SaaS to EU customers', 'How does VAT work for SaaS sales to EU vs non-EU customers?', 'vat_saas_eu_sales', ARRAY['sme-finance-director', 'eu-cross-border'], ARRAY['IE', 'EU']),

    -- Tax consultant prompts
    ('capital_gains_relief', 'Capital gains retirement relief', 'Explain CGT retirement relief conditions for disposal of business by 55+ owner.', 'capital_gains_relief', ARRAY['tax-consultant-ie'], ARRAY['IE']),
    ('transfer_pricing_subsidiary', 'Transfer pricing for subsidiary', 'What transfer pricing documentation is required for an Irish company with a US subsidiary?', 'transfer_pricing_subsidiary', ARRAY['tax-consultant-ie', 'sme-finance-director'], ARRAY['IE']),

    -- UK prompts
    ('uk_corporation_tax_rate', 'UK corporation tax rates', 'What are the current UK corporation tax rates and thresholds?', 'uk_corporation_tax_rate', ARRAY['uk-limited-company'], ARRAY['GB']),

    -- Cross-border prompts
    ('vat_moss_scheme', 'VAT MOSS scheme', 'Explain the VAT Mini One Stop Shop (MOSS) scheme for digital services to EU consumers.', 'vat_moss_scheme', ARRAY['eu-cross-border'], ARRAY['IE', 'EU'])
  ON CONFLICT (id) DO UPDATE
    SET label = EXCLUDED.label,
        prompt = EXCLUDED.prompt,
        scenario_hint = EXCLUDED.scenario_hint,
        persona_filter = EXCLUDED.persona_filter,
        jurisdictions = EXCLUDED.jurisdictions;

  RAISE NOTICE 'Created/updated % quick prompts', 12;

  -- ==================================================================================
  -- 3. SEED MODEL PRICING (LLM Providers)
  -- ==================================================================================

  -- Note: Pricing data typically lives in copilot_billing.llm_model_pricing table
  -- Check if the table exists before inserting
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'copilot_billing' AND table_name = 'llm_model_pricing') THEN
    INSERT INTO copilot_billing.llm_model_pricing (
      provider,
      model_id,
      model_name,
      input_price_per_million,
      output_price_per_million,
      effective_date,
      deprecated_date
    ) VALUES
      -- Anthropic Claude models
      ('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 3.00, 15.00, '2024-10-22'::DATE, NULL),
      ('anthropic', 'claude-3-haiku-20240307', 'Claude 3 Haiku', 0.25, 1.25, '2024-03-07'::DATE, NULL),

      -- OpenAI models
      ('openai', 'gpt-4-turbo-2024-04-09', 'GPT-4 Turbo', 10.00, 30.00, '2024-04-09'::DATE, NULL),
      ('openai', 'gpt-4o-2024-05-13', 'GPT-4o', 5.00, 15.00, '2024-05-13'::DATE, NULL),
      ('openai', 'gpt-3.5-turbo', 'GPT-3.5 Turbo', 0.50, 1.50, '2024-01-01'::DATE, NULL),

      -- Google models
      ('google', 'gemini-1.5-pro', 'Gemini 1.5 Pro', 3.50, 10.50, '2024-02-15'::DATE, NULL),
      ('google', 'gemini-1.5-flash', 'Gemini 1.5 Flash', 0.35, 1.05, '2024-05-14'::DATE, NULL)
    ON CONFLICT (provider, model_id) DO UPDATE
      SET model_name = EXCLUDED.model_name,
          input_price_per_million = EXCLUDED.input_price_per_million,
          output_price_per_million = EXCLUDED.output_price_per_million,
          effective_date = EXCLUDED.effective_date,
          deprecated_date = EXCLUDED.deprecated_date;

    RAISE NOTICE 'Created/updated LLM model pricing for 7 models';
  ELSE
    RAISE NOTICE 'Skipped LLM model pricing (table does not exist yet)';
  END IF;

  RAISE NOTICE '✅ Reference data seed completed successfully';
  RAISE NOTICE '   Personas: 7';
  RAISE NOTICE '   Quick Prompts: 12';
  RAISE NOTICE '   Model Pricing: 7 (if table exists)';

END $$;
