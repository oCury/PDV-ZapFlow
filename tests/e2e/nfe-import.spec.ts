import { test, expect } from "@playwright/test";
import path from "path";
import { login } from "./helpers";

test.describe.serial("Products - NF-e Import", () => {
  test("should display import NF-e button", async ({ page }) => {
    await login(page);
    await page.goto("/products");

    await expect(page.getByRole("button", { name: /Importar NF-e/ })).toBeVisible({ timeout: 5000 });
  });

  test("should open modal, parse XML and import products", async ({ page }) => {
    await login(page);
    await page.goto("/products");
    await expect(page.getByRole("button", { name: /Importar NF-e/ })).toBeVisible({ timeout: 5000 });

    // Dismiss low-stock alert if visible
    const dismissBtn = page.getByText("Dispensar Tudo");
    if (await dismissBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(500);
    }

    await page.getByRole("button", { name: /Importar NF-e/ }).click();
    await expect(page.getByText("Carregue um XML de Nota Fiscal")).toBeVisible({ timeout: 3000 });

    // Upload the sample NF-e XML
    const filePath = path.resolve("tests/fixtures/sample-nfe.xml");
    const fileInput = page.locator('input[type="file"][accept=".xml"]');
    await fileInput.setInputFiles(filePath);

    // Should show parsed products
    await expect(page.getByText("4 produto(s) encontrado(s)")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[value="ARROZ TIPO 1 5KG"]')).toBeVisible();
    await expect(page.locator('input[value="FEIJAO CARIOCA 1KG"]')).toBeVisible();

    // Click import button
    await page.getByRole("button", { name: /Importar 4 Produto/ }).click();

    // Should show success message (created or updated)
    await expect(page.getByText(/criado\(s\)|atualizado\(s\)/)).toBeVisible({ timeout: 10000 });

    // Close modal
    await page.getByRole("button", { name: "Fechar" }).click();

    // Verify products appear in the list
    await page.waitForTimeout(1000);
    await expect(page.getByText("ARROZ TIPO 1 5KG")).toBeVisible({ timeout: 5000 });
  });

  // Cleanup: delete imported products via API
  test("should cleanup imported NF-e products", async ({ page }) => {
    await login(page);

    // Delete via API to avoid UI flakiness
    const barcodes = ["7891234567890", "7899876543210", "7891011121314", "7895432167890"];
    for (const barcode of barcodes) {
      const res = await page.request.get(`/api/products/barcode/${barcode}`);
      if (res.ok()) {
        const product = await res.json();
        if (product?.id) {
          await page.request.delete(`/api/products/${product.id}`);
        }
      }
    }
  });
});
