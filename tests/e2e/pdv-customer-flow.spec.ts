import { test, expect } from "@playwright/test";
import { login, addProductAndFinish } from "./helpers";

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
