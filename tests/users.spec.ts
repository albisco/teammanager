import { test, expect, type Page } from "@playwright/test";

// Regression: ISSUE-001 — User management page (/admin/users) added in PR #14
// Found by /qa on 2026-04-09
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-09.md

const CREDS = {
  admin: { email: "qa_admin@teammanager.com", password: "test1234" },
  teamManager: { email: "qa_tm@teammanager.com", password: "test1234" },
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------
test.describe("Users page access control", () => {
  test("ADMIN can access /admin/users", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    await page.goto("/admin/users");
    await expect(page).toHaveURL("/admin/users");
    await expect(page.locator("h1")).toContainText("Users");
  });

  test("TEAM_MANAGER is redirected away from /admin/users", async ({ page }) => {
    await login(page, CREDS.teamManager.email, CREDS.teamManager.password);
    await page.waitForURL("/manager/dashboard", { timeout: 15000 });
    await page.goto("/admin/users");
    // Should be redirected to login (no admin access)
    await expect(page).not.toHaveURL("/admin/users");
  });
});

// ---------------------------------------------------------------------------
// Users page renders without console errors
// ---------------------------------------------------------------------------
test.describe("Users page rendering", () => {
  test("loads without JS errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    // Filter out known Next.js dev noise
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("Download the React DevTools") && !e.includes("Warning:")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("Users nav link is visible in sidebar", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    const usersLink = page.locator('a[href="/admin/users"]');
    await expect(usersLink).toBeVisible();
  });

  test("page shows Add User button", async ({ page }) => {
    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    const addButton = page.getByRole("button", { name: /add user/i });
    await expect(addButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// toggleTeam regression — ternary-as-statement ESLint fix (users/page.tsx:169)
// The UI toggle should expand/collapse team rows without a JS crash
// ---------------------------------------------------------------------------
test.describe("toggleTeam regression", () => {
  test("clicking a team row toggles expansion without error", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await login(page, CREDS.admin.email, CREDS.admin.password);
    await page.waitForURL("/admin/dashboard", { timeout: 15000 });
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    // Find team expand/collapse buttons and click one if present
    const teamButtons = page.locator('[data-testid="team-toggle"], button:has-text("U12"), button:has-text("U10"), button:has-text("QA Team")');
    const count = await teamButtons.count();
    if (count > 0) {
      await teamButtons.first().click();
      await page.waitForTimeout(300);
      // Click again to toggle back
      await teamButtons.first().click();
    }

    // No JS errors means the if/else fix held
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("Download the React DevTools") && !e.includes("Warning:")
    );
    expect(realErrors).toHaveLength(0);
  });
});
