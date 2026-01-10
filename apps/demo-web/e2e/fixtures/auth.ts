import { Page } from '@playwright/test';

/**
 * Authentication helpers for E2E tests
 *
 * All test users from realistic seed data:
 * - DataTech Solutions (Enterprise tier) - 12 users
 * - Emerald Tax Consulting (Pro tier) - 6 users
 * - Seán O'Brien (Personal tier) - 1 user
 * - Platform Admins (Global support team) - 10 users
 */

export interface TestUser {
  email: string;
  password: string;
  name: string;
  tenantType: 'enterprise' | 'pro' | 'personal' | 'admin';
  tenantName?: string;
  role: string;
  description?: string;
}

// ============================================================================
// DATATECH SOLUTIONS (Enterprise Tier) - €5,000/month quota
// ============================================================================
export const DATATECH_USERS = {
  ceo: {
    email: 'niamh.mccarthy@datatech.ie',
    password: 'Password123!',
    name: 'Niamh McCarthy',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'owner',
    description: 'CEO - Full platform access',
  },
  cfo: {
    email: 'ronan.osullivan@datatech.ie',
    password: 'Password123!',
    name: "Ronan O'Sullivan",
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'admin',
    description: 'CFO - Finance decisions, R&D credits',
  },
  financeDirector: {
    email: 'siobhan.walsh@datatech.ie',
    password: 'Password123!',
    name: 'Siobhan Walsh',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'admin',
    description: 'Finance Director - Payroll/VAT queries',
  },
  financeManager: {
    email: 'declan.ryan@datatech.ie',
    password: 'Password123!',
    name: 'Declan Ryan',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'member',
    description: 'Finance Manager - Financial reports',
  },
  payrollSpecialist: {
    email: 'aoife.murphy@datatech.ie',
    password: 'Password123!',
    name: 'Aoife Murphy',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'member',
    description: 'Payroll Specialist - PAYE/PRSI',
  },
  cto: {
    email: 'liam.fitzgerald@datatech.ie',
    password: 'Password123!',
    name: 'Liam Fitzgerald',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'admin',
    description: 'CTO - R&D credit claims',
  },
  engineeringLead: {
    email: 'ciaran.burke@datatech.ie',
    password: 'Password123!',
    name: 'Ciarán Burke',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'member',
    description: 'Engineering Lead - IP structures',
  },
  hrDirector: {
    email: 'orla.brennan@datatech.ie',
    password: 'Password123!',
    name: 'Orla Brennan',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'admin',
    description: 'HR Director - BIK/employee benefits',
  },
  hrManager: {
    email: 'sinead.oconnor@datatech.ie',
    password: 'Password123!',
    name: "Sinéad O'Connor",
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'member',
    description: 'HR Manager - KEEP/ESOS options',
  },
  legalCounsel: {
    email: 'conor.doyle@datatech.ie',
    password: 'Password123!',
    name: 'Conor Doyle',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'admin',
    description: 'Legal Counsel - Exit strategy',
  },
  externalAuditor: {
    email: 'mary.kavanagh@kpmg.ie',
    password: 'Password123!',
    name: 'Mary Kavanagh',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'viewer',
    description: 'External Auditor (KPMG) - Read-only',
  },
  taxConsultant: {
    email: 'eoin.gallagher@pwc.ie',
    password: 'Password123!',
    name: 'Eoin Gallagher',
    tenantType: 'enterprise' as const,
    tenantName: 'DataTech Solutions',
    role: 'viewer',
    description: 'Tax Consultant (PwC) - Read-only',
  },
};

// ============================================================================
// EMERALD TAX CONSULTING (Pro Tier) - €1,500/month quota
// ============================================================================
export const EMERALD_USERS = {
  managingPartner: {
    email: 'fiona@emeraldtax.ie',
    password: 'Password123!',
    name: 'Fiona Collins',
    tenantType: 'pro' as const,
    tenantName: 'Emerald Tax Consulting',
    role: 'owner',
    description: 'Managing Partner - Firm leadership',
  },
  seniorConsultant1: {
    email: 'brendan@emeraldtax.ie',
    password: 'Password123!',
    name: 'Brendan Hayes',
    tenantType: 'pro' as const,
    tenantName: 'Emerald Tax Consulting',
    role: 'admin',
    description: 'Senior Tax Consultant - Complex positions',
  },
  seniorConsultant2: {
    email: 'claire@emeraldtax.ie',
    password: 'Password123!',
    name: 'Claire Nolan',
    tenantType: 'pro' as const,
    tenantName: 'Emerald Tax Consulting',
    role: 'admin',
    description: 'Senior Tax Consultant - Client advisory',
  },
  practiceManager: {
    email: 'teresa@emeraldtax.ie',
    password: 'Password123!',
    name: 'Teresa Flynn',
    tenantType: 'pro' as const,
    tenantName: 'Emerald Tax Consulting',
    role: 'admin',
    description: 'Practice Manager - Operations',
  },
  taxConsultant: {
    email: 'darragh@emeraldtax.ie',
    password: 'Password123!',
    name: 'Darragh Murphy',
    tenantType: 'pro' as const,
    tenantName: 'Emerald Tax Consulting',
    role: 'member',
    description: 'Tax Consultant - Tax compliance',
  },
  juniorConsultant: {
    email: 'aoibhinn@emeraldtax.ie',
    password: 'Password123!',
    name: 'Aoibhinn Kelly',
    tenantType: 'pro' as const,
    tenantName: 'Emerald Tax Consulting',
    role: 'member',
    description: 'Junior Consultant - Learning/support',
  },
};

// ============================================================================
// SEÁN O'BRIEN (Personal Tier) - €50/month quota
// ============================================================================
export const PERSONAL_USERS = {
  sean: {
    email: 'sean.obrien@freelancetech.ie',
    password: 'Password123!',
    name: "Seán O'Brien",
    tenantType: 'personal' as const,
    tenantName: "Seán O'Brien",
    role: 'owner',
    description: 'Freelance IT Consultant',
  },
};

// ============================================================================
// PLATFORM ADMINS (Global Support Team)
// ============================================================================
export const ADMIN_USERS = {
  superAdmin: {
    email: 'grainne.nimhaonaigh@regintel.io',
    password: 'AdminPassword123!',
    name: 'Gráinne Ní Mhaonaigh',
    tenantType: 'admin' as const,
    role: 'super_admin',
    description: 'Super Admin - Full platform access (Dublin)',
  },
  platformEngineer1: {
    email: 'tadhg.oreilly@regintel.io',
    password: 'AdminPassword123!',
    name: "Tadhg O'Reilly",
    tenantType: 'admin' as const,
    role: 'platform_engineer',
    description: 'Platform Engineer - Infrastructure (Dublin)',
  },
  platformEngineer2: {
    email: 'caoimhe.byrne@regintel.io',
    password: 'AdminPassword123!',
    name: 'Caoimhe Byrne',
    tenantType: 'admin' as const,
    role: 'platform_engineer',
    description: 'Platform Engineer - LLM integration (Dublin)',
  },
  accountManager: {
    email: 'donal.lynch@regintel.io',
    password: 'AdminPassword123!',
    name: 'Donal Lynch',
    tenantType: 'admin' as const,
    role: 'account_manager',
    description: 'Account Manager - DataTech assigned (Dublin)',
  },
  complianceAuditor: {
    email: 'marie.dubois@regintel.io',
    password: 'AdminPassword123!',
    name: 'Marie Dubois',
    tenantType: 'admin' as const,
    role: 'compliance_auditor',
    description: 'Compliance Auditor - Read-only (Brussels)',
  },
  supportTier3: {
    email: 'padraig.brennan@regintel.io',
    password: 'AdminPassword123!',
    name: 'Pádraig Brennan',
    tenantType: 'admin' as const,
    role: 'support_tier_3',
    description: 'Tier 3 Support - Engineering escalations (Dublin)',
  },
  supportTier2_1: {
    email: 'priya.sharma@regintel.io',
    password: 'AdminPassword123!',
    name: 'Priya Sharma',
    tenantType: 'admin' as const,
    role: 'support_tier_2',
    description: 'Tier 2 Support - Cross-tenant access (Bangalore)',
  },
  supportTier2_2: {
    email: 'rajesh.kumar@regintel.io',
    password: 'AdminPassword123!',
    name: 'Rajesh Kumar',
    tenantType: 'admin' as const,
    role: 'support_tier_2',
    description: 'Tier 2 Support - Night coverage (Bangalore)',
  },
  supportTier1_1: {
    email: 'maria.santos@regintel.io',
    password: 'AdminPassword123!',
    name: 'Maria Santos',
    tenantType: 'admin' as const,
    role: 'support_tier_1',
    description: 'Tier 1 Support - DataTech + Emerald (Manila)',
  },
  supportTier1_2: {
    email: 'jose.reyes@regintel.io',
    password: 'AdminPassword123!',
    name: 'Jose Reyes',
    tenantType: 'admin' as const,
    role: 'support_tier_1',
    description: 'Tier 1 Support - DataTech + Emerald (Manila)',
  },
};

// ============================================================================
// COMBINED TEST_USERS (Backwards compatible)
// ============================================================================
export const TEST_USERS = {
  // DataTech (backwards compatible names)
  dataTechCEO: DATATECH_USERS.ceo,
  dataTechCFO: DATATECH_USERS.cfo,
  dataTechFinanceDirector: DATATECH_USERS.financeDirector,
  dataTechFinanceManager: DATATECH_USERS.financeManager,
  dataTechPayrollSpecialist: DATATECH_USERS.payrollSpecialist,
  dataTechCTO: DATATECH_USERS.cto,
  dataTechEngineeringLead: DATATECH_USERS.engineeringLead,
  dataTechHRDirector: DATATECH_USERS.hrDirector,
  dataTechHRManager: DATATECH_USERS.hrManager,
  dataTechLegalCounsel: DATATECH_USERS.legalCounsel,
  dataTechExternalAuditor: DATATECH_USERS.externalAuditor,
  dataTechTaxConsultant: DATATECH_USERS.taxConsultant,

  // Emerald Tax (backwards compatible names)
  emeraldManagingPartner: EMERALD_USERS.managingPartner,
  emeraldSeniorConsultant: EMERALD_USERS.seniorConsultant1,
  emeraldSeniorConsultant2: EMERALD_USERS.seniorConsultant2,
  emeraldPracticeManager: EMERALD_USERS.practiceManager,
  emeraldTaxConsultant: EMERALD_USERS.taxConsultant,
  emeraldJuniorConsultant: EMERALD_USERS.juniorConsultant,

  // Personal (backwards compatible name)
  seanPersonal: PERSONAL_USERS.sean,

  // Platform Admins
  superAdmin: ADMIN_USERS.superAdmin,
  platformEngineer: ADMIN_USERS.platformEngineer1,
  accountManager: ADMIN_USERS.accountManager,
  complianceAuditor: ADMIN_USERS.complianceAuditor,
  supportTier3: ADMIN_USERS.supportTier3,
  supportTier2: ADMIN_USERS.supportTier2_1,
  supportTier1: ADMIN_USERS.supportTier1_1,
} as const;

// ============================================================================
// ALL USERS (for iteration)
// ============================================================================
export const ALL_USERS: TestUser[] = [
  ...Object.values(DATATECH_USERS),
  ...Object.values(EMERALD_USERS),
  ...Object.values(PERSONAL_USERS),
  ...Object.values(ADMIN_USERS),
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Login helper that navigates to login page and authenticates
 */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');

  // Wait for login form to be visible
  await page.waitForSelector('form', { timeout: 10000 });

  // Fill in credentials
  await page.fill('input[name="email"], input[type="email"]', user.email);
  await page.fill(
    'input[name="password"], input[type="password"]',
    user.password
  );

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to complete (either to home or previous page)
  await page.waitForURL(/\/((?!login).)*/, { timeout: 15000 });

  // Verify we're logged in by checking for user avatar or profile element
  await page.waitForSelector(
    '[data-testid="user-avatar"], [aria-label*="Profile"], [data-testid="user-menu"]',
    {
      timeout: 10000,
    }
  );
}

/**
 * Login with retry for flaky auth
 */
export async function loginWithRetry(
  page: Page,
  user: TestUser,
  maxRetries = 3
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await login(page, user);
      return;
    } catch (error) {
      lastError = error as Error;
      console.log(`Login attempt ${attempt} failed, retrying...`);
      await page.context().clearCookies();
      await page.waitForTimeout(1000);
    }
  }

  throw new Error(
    `Failed to login after ${maxRetries} attempts: ${lastError?.message}`
  );
}

/**
 * Logout helper
 */
export async function logout(page: Page): Promise<void> {
  // Click profile/avatar to open menu
  await page.click(
    '[data-testid="user-avatar"], [aria-label*="Profile"], [data-testid="user-menu"]'
  );

  // Wait for dropdown menu
  await page.waitForSelector(
    '[data-testid="logout-button"], button:has-text("Logout"), button:has-text("Sign out")',
    { timeout: 5000 }
  );

  // Click logout button
  await page.click(
    '[data-testid="logout-button"], button:has-text("Logout"), button:has-text("Sign out")'
  );

  // Wait for redirect to login page
  await page.waitForURL('/login', { timeout: 10000 });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(
      '[data-testid="user-avatar"], [aria-label*="Profile"], [data-testid="user-menu"]',
      {
        timeout: 3000,
      }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current user's display name from the UI
 */
export async function getCurrentUserName(page: Page): Promise<string | null> {
  try {
    const element = await page.waitForSelector(
      '[data-testid="user-name"], [data-testid="user-display-name"]',
      { timeout: 3000 }
    );
    return element ? await element.textContent() : null;
  } catch {
    return null;
  }
}

/**
 * Get current tenant name from the UI
 */
export async function getCurrentTenantName(page: Page): Promise<string | null> {
  try {
    const element = await page.waitForSelector(
      '[data-testid="tenant-name"], [data-testid="workspace-name"]',
      { timeout: 3000 }
    );
    return element ? await element.textContent() : null;
  } catch {
    return null;
  }
}

/**
 * Navigate to a specific page and ensure authenticated
 */
export async function navigateAsUser(
  page: Page,
  user: TestUser,
  path: string
): Promise<void> {
  // Check if already authenticated
  await page.goto(path);

  const authenticated = await isAuthenticated(page);
  if (!authenticated) {
    await login(page, user);
    await page.goto(path);
  }
}

/**
 * Clear session and start fresh
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
