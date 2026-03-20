import { test, expect, type Page } from "@playwright/test";

const CREDS = {
  superAdmin: { email: "qa_superadmin@teammanager.com", password: "test1234" },
  admin: { email: "qa_admin@teammanager.com", password: "test1234" },
  teamManager: { email: "qa_tm@teammanager.com", password: "test1234" },
  invalid: { email: "nobody@example.com", password: "wrongpass" },
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

// ---------------------------------------------------------------------------
// SUPER_ADMIN
// ---------------------------------------------------------------------------
test.describe("SUPER_ADMIN", () => {
  test("login redirects to /admin/dashboard", async ({ page }) => {
    await login(page, CREDS.superAdmin.email, CREDS.superAdmin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    await expect(page).toHaveURL("/admin/dashboard");
  });

  test("can access /admin/players", async ({ page }) => {
    await login(page, CREDS.superAdmin.email, CREDS.superAdmin.password);
    await page.waitForURL("/admin/dashboard");
    await page.goto("/admin/players");
    await expect(page).toHaveURL("/admin/players");
  });

  test("can access /admin/clubs (SUPER_ADMIN only)", async ({ page }) => {
    await login(page, CREDS.superAdmin.email, CREDS.superAdmin.password);
    await page.waitForURL("/admin/dashboard");
    await page.goto("/admin/clubs");
    await expect(page).toHaveURL("/admin/clubs");
  });

  test("is blocked from /manager/dashboard", async ({ page }) => {
    await login(page, CREDS.superAdmin.email, CREDS.superAdmin.password);
    await page.waitForURL("/admin/dashboard");
    await page.goto("/manager/dashboard");
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
test.describe("ADMIN", () => {
  test("login redirects to /admin/dashboard", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    await expect(page).toHaveURL("/admin/dashboard");
  });

  test("can access /admin/season", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard");
    await page.goto("/admin/season");
    await expect(page).toHaveURL("/admin/season");
  });

  test("can access /admin/roster", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard");
    await page.goto("/admin/roster");
    await expect(page).toHaveURL("/admin/roster");
  });

  test("is blocked from /manager/dashboard", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard");
    await page.goto("/manager/dashboard");
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// TEAM_MANAGER
// ---------------------------------------------------------------------------
test.describe("TEAM_MANAGER", () => {
  test("login redirects to /manager/dashboard", async ({ page }) => {
    await login(page, CREDS.teamManager.email, CREDS.teamManager.password);
    await page.waitForURL("/manager/dashboard", { timeout: 15000 });
    await expect(page).toHaveURL("/manager/dashboard");
  });

  test("can access /manager/roster", async ({ page }) => {
    await login(page, CREDS.teamManager.email, CREDS.teamManager.password);
    await page.waitForURL("/manager/dashboard");
    await page.goto("/manager/roster");
    await expect(page).toHaveURL("/manager/roster");
  });

  test("can access /manager/awards", async ({ page }) => {
    await login(page, CREDS.teamManager.email, CREDS.teamManager.password);
    await page.waitForURL("/manager/dashboard");
    await page.goto("/manager/awards");
    await expect(page).toHaveURL("/manager/awards");
  });

  test("session contains teamId — /api/manager/team returns 200", async ({
    page,
  }) => {
    await login(page, CREDS.teamManager.email, CREDS.teamManager.password);
    await page.waitForURL("/manager/dashboard");
    const response = await page.request.get("/api/manager/team");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("qa-test-team-id");
    expect(data.name).toBe("QA Team");
  });

  test("is blocked from /admin/dashboard", async ({ page }) => {
    await login(page, CREDS.teamManager.email, CREDS.teamManager.password);
    await page.waitForURL("/manager/dashboard");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL("/login");
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated
// ---------------------------------------------------------------------------
test.describe("Unauthenticated", () => {
  test("is redirected to /login from /admin/dashboard", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("is redirected to /login from /manager/dashboard", async ({ page }) => {
    await page.goto("/manager/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("is redirected to /login from /family/dashboard", async ({ page }) => {
    await page.goto("/family/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error message on bad credentials", async ({ page }) => {
    await login(page, CREDS.invalid.email, CREDS.invalid.password);
    await expect(page.locator("text=Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });
});
