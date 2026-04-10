import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@zapflow.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 10000 });
}

test.describe.serial("Settings - Cashback Notifications", () => {
  test("should display notification settings section", async ({ page }) => {
    await login(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Configurações", exact: true })).toBeVisible();
    await expect(page.getByText("Notificações de Cashback")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Dias após a compra para enviar")).toBeVisible();
    await expect(page.getByText("Percentual de cashback")).toBeVisible();
  });

  test("should save and persist custom values", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByText("Notificações de Cashback")).toBeVisible({ timeout: 10000 });

    // Wait for settings to load
    const daysInput = page.locator('input[type="number"][min="1"][max="90"]');
    await expect(daysInput).toBeVisible();

    // Set new values
    await daysInput.fill("7");
    await page.locator('input[type="number"][min="1"][max="50"]').fill("20");

    // Save
    const saveBtn = page.locator("section").filter({ hasText: "Notificações de Cashback" }).getByRole("button", { name: "Salvar" });
    await saveBtn.click();

    // Wait for success
    await expect(page.getByText("Configurações salvas!")).toBeVisible({ timeout: 5000 });

    // Reload and verify
    await page.reload();
    await expect(page.getByText("Notificações de Cashback")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    await expect(page.locator('input[type="number"][min="1"][max="90"]')).toHaveValue("7", { timeout: 5000 });
    await expect(page.locator('input[type="number"][min="1"][max="50"]')).toHaveValue("20", { timeout: 5000 });
  });

  test("should restore defaults", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByText("Notificações de Cashback")).toBeVisible({ timeout: 10000 });

    await page.locator('input[type="number"][min="1"][max="90"]').fill("15");
    await page.locator('input[type="number"][min="1"][max="50"]').fill("10");

    const saveBtn = page.locator("section").filter({ hasText: "Notificações de Cashback" }).getByRole("button", { name: "Salvar" });
    await saveBtn.click();
    await expect(page.getByText("Configurações salvas!")).toBeVisible({ timeout: 5000 });
  });
});
