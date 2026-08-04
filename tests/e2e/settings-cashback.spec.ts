import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Cashback configuration lives on the dedicated /cashback page (behind the
// "Configurações" toggle), NOT on /settings. This spec was previously pointed
// at a "Notificações de Cashback" section on /settings that no longer exists.
test.describe.serial("Cashback - Settings", () => {
  const openSettings = async (page: import("@playwright/test").Page) => {
    await page.goto("/cashback");
    await expect(page.getByRole("heading", { name: "Cashback", exact: true })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Configurações", exact: true }).click();
    await expect(page.getByText("Configurações do Cashback")).toBeVisible({ timeout: 10000 });
  };

  const percentInput = (page: import("@playwright/test").Page) =>
    page.locator('input[type="number"][min="1"][max="50"]');
  const daysInput = (page: import("@playwright/test").Page) =>
    page.locator('input[type="number"][min="1"][max="90"]');
  const saveBtn = (page: import("@playwright/test").Page) =>
    page
      .locator("section")
      .filter({ hasText: "Configurações do Cashback" })
      .getByRole("button", { name: "Salvar" });

  test("should display cashback settings section", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await expect(page.getByText("Percentual de cashback")).toBeVisible();
    await expect(page.getByText("Dias para envio automático")).toBeVisible();
  });

  test("should save and persist custom values", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await percentInput(page).fill("20");
    await daysInput(page).fill("7");
    await saveBtn(page).click();
    await expect(page.getByText("Configurações salvas!")).toBeVisible({ timeout: 5000 });

    // Reload, reopen settings, and confirm the values persisted.
    await openSettings(page);
    await expect(percentInput(page)).toHaveValue("20", { timeout: 5000 });
    await expect(daysInput(page)).toHaveValue("7", { timeout: 5000 });
  });

  test("should restore defaults", async ({ page }) => {
    await login(page);
    await openSettings(page);

    await percentInput(page).fill("10");
    await daysInput(page).fill("15");
    await saveBtn(page).click();
    await expect(page.getByText("Configurações salvas!")).toBeVisible({ timeout: 5000 });
  });
});
