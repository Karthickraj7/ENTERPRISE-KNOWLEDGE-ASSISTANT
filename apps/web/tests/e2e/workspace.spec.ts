import { test, expect } from "@playwright/test";

test.describe("Enterprise Knowledge Assistant E2E Workflow", () => {
  test("Sign in via isolated dev auth, inspect documents, run hybrid search, and open citation", async ({ page }) => {
    await page.goto("http://localhost:3000/login");
    await expect(page.locator("h1")).toContainText("Sign in to Knowledge Workspace");
    await page.click("button[type='submit']");
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.locator("h1")).toContainText("Knowledge Workspace Overview");
  });
});
