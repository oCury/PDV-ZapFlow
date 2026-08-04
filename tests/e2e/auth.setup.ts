import { test as setup, expect } from "@playwright/test";

/**
 * Shared login helper — saves auth state to reuse across tests
 */
setup("login as admin", async ({ page }) => {
  await page.goto("/login");

  await page.fill('input[type="email"]', "admin@zapflow.com");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10000 });

  // Save signed-in state
  await page.context().storageState({ path: "tests/e2e/.auth-state.json" });
});
