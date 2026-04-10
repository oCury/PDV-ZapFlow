import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@zapflow.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 10000 });
}

async function addProductAndFinish(page: import("@playwright/test").Page) {
  await page.goto("/pdv");
  // Wait for products to load
  await page.waitForTimeout(2000);

  // Click first product button that is enabled
  const productCards = page.locator("button.touch-target.group").first();
  await expect(productCards).toBeVisible({ timeout: 10000 });
  await productCards.click();

  // Wait for cart to update
  await page.waitForTimeout(500);

  // Dismiss low-stock alert if visible (it can overlay buttons)
  const dismissBtn = page.getByText("Dispensar Tudo");
  if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dismissBtn.click();
  }

  // Click Finalizar Venda (desktop sidebar button)
  const finishBtn = page.getByRole("button", { name: /Finalizar Venda/ });
  await expect(finishBtn).toBeEnabled({ timeout: 3000 });
  await finishBtn.click();
}

test.describe.serial("PDV - Customer Identification Flow", () => {
  test("should open customer modal when finishing sale", async ({ page }) => {
    await login(page);
    await addProductAndFinish(page);

    await expect(page.getByText("Identificar Cliente")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Nome ou telefone do cliente...")).toBeVisible();
    await expect(page.getByText("Pular - Venda sem cliente")).toBeVisible();
  });

  test("should skip to payment modal", async ({ page }) => {
    await login(page);
    await addProductAndFinish(page);

    await expect(page.getByText("Identificar Cliente")).toBeVisible({ timeout: 5000 });
    await page.getByText("Pular - Venda sem cliente").click();

    // Payment modal should appear
    await expect(page.getByText("Total: R$")).toBeVisible({ timeout: 5000 });
  });

  test("should show not found for unknown phone", async ({ page }) => {
    await login(page);
    await addProductAndFinish(page);

    await expect(page.getByText("Identificar Cliente")).toBeVisible({ timeout: 5000 });

    const searchInput = page.getByPlaceholder("Nome ou telefone do cliente...");
    await searchInput.fill("11999990000");
    // Click search button (sibling of the search input)
    await searchInput.locator("..").locator("button").click();

    await expect(page.getByText("Cliente não encontrado")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Cadastrar Cliente")).toBeVisible();
  });
});
