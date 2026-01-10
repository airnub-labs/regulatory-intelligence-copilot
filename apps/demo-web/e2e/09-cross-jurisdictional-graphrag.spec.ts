import { test, expect } from '@playwright/test';
import {
  DATATECH_USERS,
  EMERALD_USERS,
  login,
} from './fixtures/auth';
import { createConsoleCapture } from './fixtures/console-capture';

/**
 * Cross-Jurisdictional GraphRAG Tests
 *
 * Tests multi-jurisdictional regulatory queries using the enhanced Memgraph data:
 * - EU Directives (ATAD, DAC6, Pillar 2, Parent-Subsidiary)
 * - Tax Treaties (IE-UK, IE-US, IE-DE, OECD MLI)
 * - Cross-border scenarios (posted workers, transfer pricing, PE rules)
 * - UK/NI/EU coordination rules
 *
 * @tags @graphrag @crossborder @EU @UK @tax-treaties
 */

test.describe('Cross-Jurisdictional GraphRAG - EU Directives', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@EU ATAD implementation query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-eu-atad');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about ATAD implementation in Ireland
    await chatInput.fill("How does Ireland implement the Anti-Tax Avoidance Directive (ATAD) interest limitation rules?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference ATAD, interest limitation, 30% EBITDA
    expect(response).toMatch(/ATAD|interest.*limitation|EBITDA|30%|2016\/1164/i);

    consoleCapture.saveToFile();
  });

  test('@EU DAC6 reporting query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-eu-dac6');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.seniorConsultant1);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about DAC6 reporting
    await chatInput.fill("What are the DAC6 reporting requirements for cross-border tax arrangements involving Irish intermediaries?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference DAC6, hallmarks, 30-day filing period
    expect(response).toMatch(/DAC6|hallmark|30.*day|reportable|intermediar/i);

    consoleCapture.saveToFile();
  });

  test('@EU Pillar 2 global minimum tax query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-eu-pillar2');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about Pillar 2
    await chatInput.fill("How will the Pillar 2 global minimum tax directive affect Irish companies with group revenue over €750 million?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference Pillar 2, 15% minimum, IIR, UTPR
    expect(response).toMatch(/Pillar 2|15%|minimum.*tax|IIR|UTPR|€750 million|750m/i);

    consoleCapture.saveToFile();
  });

  test('@EU Parent-Subsidiary Directive query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-eu-parent-subsidiary');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about dividend withholding tax exemption
    await chatInput.fill("What are the requirements for withholding tax exemption on dividends from an Irish subsidiary to an EU parent company under the Parent-Subsidiary Directive?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference holding requirements, 10%/25% thresholds
    expect(response).toMatch(/Parent.*Subsidiary|dividend|withholding.*exempt|10%|holding period|2 year/i);

    consoleCapture.saveToFile();
  });
});

test.describe('Cross-Jurisdictional GraphRAG - Tax Treaties', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@UK Ireland-UK tax treaty query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-treaty-ie-uk');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.seniorConsultant1);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about IE-UK treaty
    await chatInput.fill("What are the key provisions of the Ireland-UK double taxation treaty for dividend payments and what withholding tax rates apply?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference treaty rates, withholding tax
    expect(response).toMatch(/Ireland.*UK|UK.*Ireland|treaty|withholding.*tax|dividend|0%|5%|15%/i);

    consoleCapture.saveToFile();
  });

  test('@US Ireland-US tax treaty query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-treaty-ie-us');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about IE-US treaty - relevant for US subsidiary
    await chatInput.fill("What are the withholding tax rates on royalties and interest payments from our US subsidiary to Ireland under the Ireland-US tax treaty?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference US treaty rates
    expect(response).toMatch(/Ireland.*US|US.*Ireland|treaty|royalt|interest|withholding|0%/i);

    consoleCapture.saveToFile();
  });

  test('@MLI OECD MLI impact query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-oecd-mli');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.managingPartner);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about MLI
    await chatInput.fill("How has the OECD Multilateral Instrument (MLI) modified Ireland's tax treaties, particularly the principal purpose test?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference MLI, PPT, treaty shopping
    expect(response).toMatch(/MLI|Multilateral.*Instrument|PPT|principal.*purpose|treaty.*shopping/i);

    consoleCapture.saveToFile();
  });
});

test.describe('Cross-Jurisdictional GraphRAG - Cross-Border Workers', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@EU Posted worker social security rules', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-posted-worker');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.seniorConsultant1);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about posted workers
    await chatInput.fill("What are the social security rules for an Irish employee posted to France for 20 months? Can they remain in the Irish PRSI system?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference EU regulations, A1 certificate, 24-month rule
    expect(response).toMatch(/posted worker|A1.*certificate|24 month|883\/2004|PRSI|social security/i);

    consoleCapture.saveToFile();
  });

  test('@UK Ireland-UK cross-border worker scenario', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-ie-uk-crossborder');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.managingPartner);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about IE-UK cross-border worker
    await chatInput.fill("What are the tax implications for an employee who lives in Northern Ireland but works for an Irish company in Dublin?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference cross-border rules, treaty, residence
    expect(response).toMatch(/Northern Ireland|cross.*border|resident|treaty|PAYE|183 day/i);

    consoleCapture.saveToFile();
  });

  test('@NI Northern Ireland Protocol implications', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-ni-protocol');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.seniorConsultant1);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about NI Protocol
    await chatInput.fill("How does the Northern Ireland Protocol affect VAT on goods moving between Ireland and Northern Ireland?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference NI Protocol, goods movement
    expect(response).toMatch(/Northern Ireland|Protocol|VAT|goods|EU.*rules|Windsor/i);

    consoleCapture.saveToFile();
  });
});

test.describe('Cross-Jurisdictional GraphRAG - Transfer Pricing', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@crossborder Transfer pricing documentation requirements', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-transfer-pricing');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about transfer pricing
    await chatInput.fill("What are Ireland's transfer pricing documentation requirements for transactions with our US subsidiary? Do we need a Master File and Local File?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference TP documentation, Master File, Local File
    expect(response).toMatch(/transfer pricing|Master File|Local File|arm.s length|documentation|OECD/i);

    consoleCapture.saveToFile();
  });

  test('@crossborder Permanent establishment risk query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-pe-risk');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.legalCounsel);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about PE risk
    await chatInput.fill("What activities would create a permanent establishment risk in Germany if we have an employee working remotely from there?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference PE rules
    expect(response).toMatch(/permanent establishment|PE|fixed place|dependent agent|183 day|treaty/i);

    consoleCapture.saveToFile();
  });
});

test.describe('Cross-Jurisdictional GraphRAG - Holding Company Structures', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('@crossborder Cyprus IP holding structure query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-cyprus-ip');
    consoleCapture.startCapture(page);

    await login(page, DATATECH_USERS.cfo);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about IP holding structure
    await chatInput.fill("What are the tax implications of using a Cyprus IP holding company for our software IP, considering Ireland's Knowledge Development Box?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference KDB, IP regime, substance requirements
    expect(response).toMatch(/Knowledge Development Box|KDB|IP|6\.25%|substance|Cyprus|nexus/i);

    consoleCapture.saveToFile();
  });

  test('@crossborder Luxembourg holding query', async ({ page }) => {
    const consoleCapture = createConsoleCapture('graphrag-luxembourg-holding');
    consoleCapture.startCapture(page);

    await login(page, EMERALD_USERS.managingPartner);
    await page.goto('/');

    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    const chatInput = page.locator('textarea, input[type="text"]').first();

    // Query about Luxembourg structures
    await chatInput.fill("What are the benefits of using a Luxembourg SOPARFI for holding Irish company shares, particularly for dividends and capital gains?");
    await chatInput.press('Enter');

    await page.waitForSelector('[data-testid="ai-message"], .ai-message', {
      timeout: 30000,
    });

    const response = await page.locator('[data-testid="ai-message"], .ai-message').last().textContent();

    // Should reference Luxembourg, participation exemption
    expect(response).toMatch(/Luxembourg|SOPARFI|participation.*exemption|dividend|capital gain|holding/i);

    consoleCapture.saveToFile();
  });
});
