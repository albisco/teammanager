import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Full onboarding E2E flow:
 * 1. SUPER_ADMIN creates a club with an admin user
 * 2. ADMIN adds players, creates a season + team + rounds, assigns players, assigns TM
 * 3. TEAM_MANAGER configures duty roles, generates roster, creates award types
 * 4. ADMIN opens voting, public vote is submitted
 * 5. TEAM_MANAGER views vote results
 *
 * This test runs serially — each step depends on the previous.
 */

const PREFIX = `e2e_${Date.now()}`;
const CLUB = { name: `${PREFIX} Eagles FC` };
const ADMIN_USER = {
  name: `${PREFIX} Club Admin`,
  email: `${PREFIX}_admin@test.com`,
  password: "testpass123",
};
const TM_USER = {
  name: `${PREFIX} Team Manager`,
  email: `${PREFIX}_tm@test.com`,
  password: "testpass123",
};
const PLAYERS = [
  { jumper: "1", first: "Jack", surname: "Smith", parent1: "Sarah", parent2: "Mike" },
  { jumper: "2", first: "Tom", surname: "Jones", parent1: "Kylie", parent2: "" },
  { jumper: "3", first: "Sam", surname: "Brown", parent1: "Grant", parent2: "Lisa" },
  { jumper: "4", first: "Liam", surname: "Smith", parent1: "Sarah", parent2: "Mike" },
  { jumper: "5", first: "Noah", surname: "Wilson", parent1: "Dave", parent2: "" },
];
const SEASON = { name: `${PREFIX} Season 2026`, year: "2026" };
const TEAM = { ageGroup: "U10", name: "Thunder" };
const SUPER_ADMIN = { email: "qa_superadmin@teammanager.com", password: "test1234" };

// Shared state across serial tests
let votingToken = "";

async function login(page: Page, email: string, password: string, expectedUrl: string) {
  // Check if already logged in as this user by hitting the session endpoint
  const sessionCheck = await page.request.get("/api/auth/session");
  const currentSession = await sessionCheck.json();
  if (currentSession?.user?.email === email) {
    // Already logged in — just navigate
    await page.goto(expectedUrl, { waitUntil: "networkidle" });
    if (!page.url().includes("/login")) return;
    // Session was stale — fall through to full login
  }

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  // Wait for the login page's router.push to navigate away from /login
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  } catch {
    // router.push didn't fire — signIn may have still set the cookie
  }

  // Navigate to the target URL (may already be there from router.push)
  if (!page.url().includes(expectedUrl.replace(/^\//, ""))) {
    await page.goto(expectedUrl, { waitUntil: "networkidle" });
  }

  // If middleware bounced us back to /login, retry once after a short wait
  if (page.url().includes("/login")) {
    await page.waitForTimeout(1000);
    await page.goto(expectedUrl, { waitUntil: "networkidle" });
  }

  if (page.url().includes("/login")) {
    throw new Error(`Login failed for ${email}: still on login page after retry`);
  }
}

async function waitForToast(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15000 });
}

/**
 * Fill an input field inside a .space-y-2 container that contains the given label text.
 * Works for forms where <Label> components don't use htmlFor.
 */
async function fillField(container: Locator, labelText: string, value: string) {
  const field = container.locator(".space-y-2").filter({ hasText: labelText });
  await field.locator("input").first().fill(value);
}

// ---------------------------------------------------------------------------
// All tests run serially in order
// ---------------------------------------------------------------------------
test.describe.configure({ mode: "serial" });

test.describe("Full Onboarding Flow", () => {
  test.setTimeout(90000);

  // Warm up the dev server before first test
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("/login", { timeout: 60000, waitUntil: "networkidle" });
    await page.close();
  });

  // =========================================================================
  // STEP 1: SUPER_ADMIN creates a club with admin user
  // =========================================================================
  test("1.1 — SUPER_ADMIN creates a new club with admin", async ({ page }) => {
    await login(page, SUPER_ADMIN.email, SUPER_ADMIN.password, "/admin/dashboard");

    await page.goto("/admin/clubs");
    await expect(page).toHaveURL(/\/admin\/clubs/);

    // Click Add Club
    await page.getByRole("button", { name: "Add Club" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill club details using placeholder selectors
    await dialog.getByPlaceholder("e.g. Salisbury Griffins").fill(CLUB.name);

    // Fill admin user details
    await dialog.getByPlaceholder("e.g. John Smith").fill(ADMIN_USER.name);
    await dialog.getByPlaceholder("admin@club.com").fill(ADMIN_USER.email);
    await dialog.getByPlaceholder("Initial password").fill(ADMIN_USER.password);

    // Save — intercept the API response to catch errors
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/clubs") && r.request().method() === "POST"),
      dialog.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(response.ok()).toBeTruthy();
    await waitForToast(page, "Club created");

    // Verify club appears in table
    await expect(page.getByText(CLUB.name)).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // STEP 2: ADMIN sets up the club — players, season, team, rounds
  // =========================================================================
  test("2.1 — ADMIN adds players", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/players");
    await expect(page).toHaveURL(/\/admin\/players/);

    for (const player of PLAYERS) {
      await page.getByRole("button", { name: "Add Player" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await fillField(dialog, "Jumper Number", player.jumper);
      await fillField(dialog, "First Name", player.first);
      await fillField(dialog, "Surname", player.surname);
      if (player.parent1) await fillField(dialog, "Parent 1", player.parent1);
      if (player.parent2) await fillField(dialog, "Parent 2", player.parent2);

      await dialog.getByRole("button", { name: "Save" }).click();
      await waitForToast(page, "Player added");

      // Wait for dialog to close
      await expect(dialog).not.toBeVisible({ timeout: 10000 });
    }

    // Verify all players are listed
    for (const player of PLAYERS) {
      await expect(page.getByText(`${player.first} ${player.surname}`).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test("2.2 — ADMIN creates a season", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/season");

    await page.getByRole("button", { name: "New Season" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("e.g. 2026 Season").fill(SEASON.name);
    await fillField(dialog, "Year", SEASON.year);

    await dialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Season created");

    // Verify season card appears
    await expect(page.getByText(SEASON.name).first()).toBeVisible({ timeout: 10000 });
  });

  test("2.3 — ADMIN creates a team with rounds", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/season");

    // Select the season (click on the season card heading)
    await page.getByRole("heading", { name: SEASON.name, exact: true }).click();
    await page.waitForTimeout(500);

    // Add team
    await page.getByRole("button", { name: "Add Team" }).click();
    const teamDialog = page.getByRole("dialog");
    await expect(teamDialog).toBeVisible();

    await teamDialog.getByPlaceholder("e.g. U7, U8, U12").fill(TEAM.ageGroup);
    await teamDialog.getByPlaceholder("e.g. Lightning").fill(TEAM.name);

    await teamDialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Team created");
    await expect(teamDialog).not.toBeVisible({ timeout: 10000 });

    // Verify team card appears and click it to expand
    await page.getByText(TEAM.name).first().click();
    // Wait for team detail to load
    await page.waitForTimeout(1000);

    // Add 5 rounds (Rounds tab is default)
    // Wait for Add Round button to be enabled (team detail needs to load)
    await expect(page.getByRole("button", { name: "Add Round" })).toBeEnabled({ timeout: 10000 });

    for (let i = 1; i <= 5; i++) {
      await page.getByRole("button", { name: "Add Round" }).click();
      const roundDialog = page.getByRole("dialog");
      await expect(roundDialog).toBeVisible();

      // Round number auto-fills, just set opponent
      await roundDialog.getByPlaceholder("e.g. Smithfield Roos").fill(`Opponent ${i}`);

      await roundDialog.getByRole("button", { name: "Save" }).click();
      // Wait for dialog to close
      await expect(roundDialog).not.toBeVisible({ timeout: 10000 });
      // Wait for the round to appear in the table before adding the next
      await expect(page.getByText(`Opponent ${i}`)).toBeVisible({ timeout: 5000 });
    }
  });

  test("2.4 — ADMIN creates TM and assigns to team", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/season");

    // Navigate to team detail
    await page.getByRole("heading", { name: SEASON.name, exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText(TEAM.name).first().click();
    await page.waitForTimeout(1000);

    // Create a TM user via "+ New" link
    await page.locator("button").filter({ hasText: "+ New" }).click();
    const tmDialog = page.getByRole("dialog");
    await expect(tmDialog).toBeVisible();

    await tmDialog.getByPlaceholder("e.g. John Smith").fill(TM_USER.name);
    await tmDialog.getByPlaceholder("john@example.com").fill(TM_USER.email);
    await tmDialog.getByPlaceholder("Initial password").fill(TM_USER.password);

    await tmDialog.getByRole("button", { name: "Create & Assign" }).click();
    await waitForToast(page, "created");
    await expect(tmDialog).not.toBeVisible({ timeout: 10000 });

    // Verify TM was assigned: wait for "Manager assigned" toast
    await waitForToast(page, "Manager assigned");
  });

  test("2.5 — ADMIN assigns players to the team", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/players");

    for (const player of PLAYERS) {
      // Find the player row and click Teams button
      const row = page.locator("tr", { hasText: `${player.first} ${player.surname}` });
      await row.getByRole("button", { name: "Teams" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Click Add button for our team — target the specific .rounded-lg.border entry
      const teamEntry = dialog.locator(".rounded-lg.border", { hasText: `${TEAM.ageGroup} ${TEAM.name}` });
      await expect(teamEntry).toBeVisible({ timeout: 5000 });
      await teamEntry.getByRole("button", { name: "Add" }).click();
      await waitForToast(page, "Added to team");

      // Wait for button to change to "Remove" (confirms the assignment took effect)
      await expect(teamEntry.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 5000 });

      // Close dialog via Escape
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Wait for player list to refresh before opening next dialog
      await page.waitForTimeout(500);
    }

    // Verify all players are on the team by checking the API
    const seasonRes = await page.request.get("/api/season");
    const seasons = await seasonRes.json();
    const season = seasons.find((s: { name: string }) => s.name === SEASON.name);
    const team = season?.teams?.find((t: { name: string }) => t.name === TEAM.name);
    expect(team?._count?.players ?? 0).toBe(PLAYERS.length);
  });

  // =========================================================================
  // STEP 3: TEAM_MANAGER configures roster and awards
  // =========================================================================
  test("3.1 — TM configures duty roles", async ({ page }) => {
    await login(page, TM_USER.email, TM_USER.password, "/manager/dashboard");

    // Verify session has teamId
    const sessionRes = await page.request.get("/api/auth/session");
    const sessionData = await sessionRes.json();
    if (!sessionData?.user?.teamId) {
      throw new Error(`TM session missing teamId. Session: ${JSON.stringify(sessionData?.user)}`);
    }

    await page.goto("/manager/roster");
    await expect(page).toHaveURL(/\/manager\/roster/);

    // Wait for page to fully load
    await expect(page.getByText("Duty Roster")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Add Role" })).toBeVisible({ timeout: 10000 });

    // Add a club duty role: "Canteen"
    await page.getByRole("button", { name: "Add Role" }).click();
    const roleDialog = page.getByRole("dialog");
    await expect(roleDialog).toBeVisible();
    await roleDialog.getByPlaceholder("e.g. Goal Umpire, Canteen, Photographer").fill("Canteen");
    await roleDialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role created");
    await expect(roleDialog).not.toBeVisible({ timeout: 10000 });

    // Add another: "Oranges"
    await page.getByRole("button", { name: "Add Role" }).click();
    const roleDialog2 = page.getByRole("dialog");
    await expect(roleDialog2).toBeVisible();
    await roleDialog2.getByPlaceholder("e.g. Goal Umpire, Canteen, Photographer").fill("Oranges");
    await roleDialog2.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role created");
    await expect(roleDialog2).not.toBeVisible({ timeout: 10000 });

    // Configure Canteen as ROTATING (default type, just save)
    const canteenRow = page.locator("tr", { hasText: "Canteen" });
    await canteenRow.getByRole("button", { name: "Configure" }).click();
    const configDialog = page.getByRole("dialog");
    await expect(configDialog).toBeVisible();
    await configDialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role configured");
    await expect(configDialog).not.toBeVisible({ timeout: 10000 });

    // Configure Oranges as ROTATING
    const orangesRow = page.locator("tr", { hasText: "Oranges" });
    await orangesRow.getByRole("button", { name: "Configure" }).click();
    const configDialog2 = page.getByRole("dialog");
    await expect(configDialog2).toBeVisible();
    await configDialog2.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role configured");
    await expect(configDialog2).not.toBeVisible({ timeout: 10000 });

    // Add and configure "Umpire" as SPECIALIST with 2 parents
    await page.getByRole("button", { name: "Add Role" }).click();
    const roleDialog3 = page.getByRole("dialog");
    await expect(roleDialog3).toBeVisible();
    await roleDialog3.getByPlaceholder("e.g. Goal Umpire, Canteen, Photographer").fill("Umpire");
    await roleDialog3.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role created");
    await expect(roleDialog3).not.toBeVisible({ timeout: 10000 });

    const umpireRow = page.locator("tr", { hasText: "Umpire" });
    await umpireRow.getByRole("button", { name: "Configure" }).click();
    const umpireDialog = page.getByRole("dialog");
    await expect(umpireDialog).toBeVisible();

    // Change role type to Specialist
    await umpireDialog.locator("select").first().selectOption("SPECIALIST");

    // Select Kylie (Jones) and Grant (Brown) as specialists via checkboxes
    await umpireDialog.locator("label", { hasText: "Kylie (Jones)" }).click();
    await umpireDialog.locator("label", { hasText: "Grant (Brown)" }).click();

    // Verify 2 specialists selected
    await expect(umpireDialog.getByText("2 selected")).toBeVisible();

    await umpireDialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role configured");
    await expect(umpireDialog).not.toBeVisible({ timeout: 10000 });

    // Verify the role detail shows person names after save
    await expect(umpireRow.getByText("Kylie (Jones)")).toBeVisible({ timeout: 10000 });
    await expect(umpireRow.getByText("Grant (Brown)")).toBeVisible({ timeout: 10000 });

    // Add and configure "Coach" as FIXED with Sarah (Smith)
    await page.getByRole("button", { name: "Add Role" }).click();
    const roleDialog4 = page.getByRole("dialog");
    await expect(roleDialog4).toBeVisible();
    await roleDialog4.getByPlaceholder("e.g. Goal Umpire, Canteen, Photographer").fill("Coach");
    await roleDialog4.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role created");
    await expect(roleDialog4).not.toBeVisible({ timeout: 10000 });

    const coachRow = page.locator("tr", { hasText: "Coach" });
    await coachRow.getByRole("button", { name: "Configure" }).click();
    const coachDialog = page.getByRole("dialog");
    await expect(coachDialog).toBeVisible();

    // Change role type to Fixed
    await coachDialog.locator("select").first().selectOption("FIXED");

    // Select Sarah (Smith) from the assigned person dropdown
    await coachDialog.locator("select").nth(1).selectOption({ label: "Sarah (Smith)" });

    await coachDialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role configured");
    await expect(coachDialog).not.toBeVisible({ timeout: 10000 });

    // Verify the role detail shows "Sarah" after save
    await expect(coachRow.getByText("Sarah")).toBeVisible({ timeout: 10000 });
  });

  test("3.1b — TM re-opens specialist config and sees persisted selections", async ({ page }) => {
    await login(page, TM_USER.email, TM_USER.password, "/manager/dashboard");
    await page.goto("/manager/roster");
    await expect(page.getByText("Duty Roster")).toBeVisible({ timeout: 15000 });

    // Re-open Umpire config and verify specialists persisted
    const umpireRow = page.locator("tr", { hasText: "Umpire" });
    await umpireRow.getByRole("button", { name: "Configure" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify checkboxes are checked (specialists persisted across page reload)
    const kylieCheckbox = dialog.locator("label", { hasText: "Kylie (Jones)" }).locator("input[type='checkbox']");
    await expect(kylieCheckbox).toBeChecked();
    const grantCheckbox = dialog.locator("label", { hasText: "Grant (Brown)" }).locator("input[type='checkbox']");
    await expect(grantCheckbox).toBeChecked();

    // Close without saving
    await dialog.getByRole("button", { name: "Save" }).click();
    await waitForToast(page, "Role configured");
  });

  test("3.2 — TM generates roster", async ({ page }) => {
    await login(page, TM_USER.email, TM_USER.password, "/manager/dashboard");

    await page.goto("/manager/roster");

    // Click Generate Roster and accept confirm dialog
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Generate Roster/ }).click();

    await waitForToast(page, "Roster generated");

    // After generation, page reloads roster data — wait for the roster grid to show assignments
    // Rotating roles should show family surnames
    await expect(page.getByText("Smith").first()).toBeVisible({ timeout: 15000 });

    // Specialist role (Umpire) should show full names, not just family surnames
    // Kylie Jones and Grant Brown should appear in the roster grid
    await expect(page.getByText("Kylie Jones").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Grant Brown").first()).toBeVisible({ timeout: 10000 });

    // Fixed role (Coach) should show full name "Sarah Smith", not just "Smith"
    await expect(page.getByText("Sarah Smith").first()).toBeVisible({ timeout: 10000 });
  });

  test("3.3 — TM creates award types", async ({ page }) => {
    await login(page, TM_USER.email, TM_USER.password, "/manager/dashboard");

    await page.goto("/manager/awards");
    await expect(page).toHaveURL(/\/manager\/awards/);

    // Create "Best On Ground" award type
    await page.getByRole("button", { name: "Add Award Type" }).click();
    const dialog1 = page.getByRole("dialog");
    await expect(dialog1).toBeVisible();
    await dialog1.getByPlaceholder("e.g. McDonald's Voucher").fill("Best On Ground");
    await dialog1.getByRole("button", { name: "Create" }).click();
    await waitForToast(page, "Award type created");
    await expect(dialog1).not.toBeVisible({ timeout: 10000 });

    // Create "Coaches Award" with quantity 2
    await page.getByRole("button", { name: "Add Award Type" }).click();
    const dialog2 = page.getByRole("dialog");
    await expect(dialog2).toBeVisible();
    await dialog2.getByPlaceholder("e.g. McDonald's Voucher").fill("Coaches Award");
    // "Awards per round" input is type=number in a plain <div>
    await dialog2.locator("input[type=number]").fill("2");
    await dialog2.getByRole("button", { name: "Create" }).click();
    await waitForToast(page, "Award type created");
    await expect(dialog2).not.toBeVisible({ timeout: 10000 });

    // Verify award types appear
    await expect(page.getByText("Best On Ground").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Coaches Award").first()).toBeVisible({ timeout: 5000 });
  });

  // =========================================================================
  // STEP 4: Voting flow — ADMIN opens voting, public votes submitted
  // =========================================================================
  test("4.1 — ADMIN opens voting for round 1", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/voting");

    // Select the team card (Card click, not table row)
    await page.locator("text=" + TEAM.name).first().click();
    await page.waitForTimeout(1000);

    // Open voting for round 1
    const round1Row = page.locator("tr").filter({ hasText: /^1/ }).first();
    await round1Row.getByRole("button", { name: "Open Voting" }).click();
    await waitForToast(page, "Voting opened");

    // Get the QR/voting link
    await round1Row.getByRole("button", { name: "QR Code" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Extract the voting token from the displayed URL
    const linkText = await dialog.locator(".break-all").textContent();
    const tokenMatch = linkText?.match(/\/vote\/(.+)$/);
    expect(tokenMatch).toBeTruthy();
    votingToken = tokenMatch![1];

    // Close dialog
    await page.keyboard.press("Escape");
  });

  test("4.2 — Public user submits a vote", async ({ page }) => {
    expect(votingToken).toBeTruthy();

    await page.goto(`/vote/${votingToken}`);
    await page.waitForLoadState("networkidle");

    // Step 1: Enter voter name (Parent is default)
    await page.getByPlaceholder("Enter your name").fill("Test Parent");
    await page.getByRole("button", { name: "Start Voting" }).click();

    // Step 2: Wait for vote step
    await expect(page.getByText("Position 1")).toBeVisible({ timeout: 5000 });

    // Select a player for each position (voting scheme is [5,4,3,2,1] — 5 positions)
    const grids = page.locator(".grid.grid-cols-2");
    const numPositions = await grids.count();
    for (let i = 0; i < numPositions; i++) {
      // Find grids fresh each iteration (React re-renders change DOM)
      const grid = page.locator(".grid.grid-cols-2").nth(i);
      const btn = grid.locator("button").first();
      await expect(btn).toBeVisible({ timeout: 5000 });
      await btn.click();
      await page.waitForTimeout(500);
    }

    // Submit vote
    await page.getByRole("button", { name: "Submit Vote" }).click();

    // Step 3: Confirmation
    await expect(page.getByText("Vote Submitted!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Test Parent")).toBeVisible();
  });

  test("4.3 — Submit a second vote (coach)", async ({ page }) => {
    expect(votingToken).toBeTruthy();

    await page.goto(`/vote/${votingToken}`);
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Enter your name").fill("Coach Dave");
    await page.getByRole("button", { name: "Coach" }).click();
    await page.getByRole("button", { name: "Start Voting" }).click();

    // Wait for vote step
    await expect(page.getByText("Position 1")).toBeVisible({ timeout: 5000 });

    // For each position, click the first available button
    const grids2 = page.locator(".grid.grid-cols-2");
    const gridCount2 = await grids2.count();
    for (let i = 0; i < gridCount2; i++) {
      const grid = grids2.nth(i);
      const btn = grid.locator("button").first();
      await expect(btn).toBeVisible({ timeout: 5000 });
      await btn.click();
      await page.waitForTimeout(500);
    }

    await page.getByRole("button", { name: "Submit Vote" }).click();
    await expect(page.getByText("Vote Submitted!")).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // STEP 5: View results
  // =========================================================================
  test("5.1 — ADMIN views voting results", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password, "/admin/dashboard");

    await page.goto("/admin/voting");

    // Select the team
    await page.locator("text=" + TEAM.name).first().click();
    await page.waitForTimeout(1000);

    // Click Results for round 1
    const round1Row = page.locator("tr").filter({ hasText: /^1/ }).first();
    await round1Row.getByRole("button", { name: "Results" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify 2 votes were submitted
    await expect(dialog.getByText("2 votes submitted")).toBeVisible();

    // Check leaderboard has players
    await expect(dialog.locator("table")).toBeVisible();

    // Switch to audit tab
    await dialog.locator("button").filter({ hasText: /Vote Audit/ }).click();

    // Verify both votes appear
    await expect(dialog.getByText("Test Parent")).toBeVisible();
    await expect(dialog.getByText("Coach Dave")).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("5.2 — TM views voting results from manager portal", async ({ page }) => {
    await login(page, TM_USER.email, TM_USER.password, "/manager/dashboard");

    await page.goto("/manager/voting");
    await expect(page).toHaveURL(/\/manager\/voting/);

    await page.waitForTimeout(1000);

    // Round 1 should show "Open" status
    await expect(page.getByText("Open").first()).toBeVisible();

    // Click Results
    const round1Row = page.locator("tr").filter({ hasText: /^1/ }).first();
    await round1Row.getByRole("button", { name: "Results" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("2 votes submitted")).toBeVisible();

    await page.keyboard.press("Escape");
  });
});
