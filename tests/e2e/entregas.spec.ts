import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@zapflow.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 10000 });
}

test.describe.serial("Entregas - Delivery management", () => {
  test("should display the deliveries page", async ({ page }) => {
    await login(page);
    await page.goto("/entregas");

    await expect(
      page.getByRole("heading", { name: "Entregas" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("should render status filter pills", async ({ page }) => {
    await login(page);
    await page.goto("/entregas");

    await expect(page.getByRole("button", { name: "Todas" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("button", { name: "Pendentes" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Saiu p/ entrega" })
    ).toBeVisible();
  });

  test("should filter to Entregues without errors", async ({ page }) => {
    await login(page);
    await page.goto("/entregas");

    await page.getByRole("button", { name: "Entregues" }).click();
    // Either rows render or the empty state shows — both are valid, no crash.
    await expect(
      page.getByRole("heading", { name: "Entregas" })
    ).toBeVisible();
  });
});
