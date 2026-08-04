import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe.serial("Customers - CRUD Operations", () => {
  test("should display customers page", async ({ page }) => {
    await login(page);
    await page.goto("/customers");

    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("CRM e programa de fidelidade")).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo Cliente" })).toBeVisible();
  });

  test("should create a new customer", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible({ timeout: 5000 });

    const newBtn = page.getByRole("button", { name: "Novo Cliente" });
    await expect(newBtn).toBeVisible({ timeout: 5000 });
    await newBtn.click();
    await expect(page.getByRole("heading", { name: "Novo Cliente" })).toBeVisible({ timeout: 5000 });

    await page.locator('input[placeholder="Nome completo"]').fill("Teste Playwright");
    await page.locator('input[placeholder="(11) 99999-9999"]').fill("11888880099");
    await page.locator('input[placeholder="email@exemplo.com"]').fill("teste-pw@test.com");

    await page.getByRole("button", { name: "Cadastrar" }).click();

    // Wait for list to update
    await expect(page.getByText("Teste Playwright")).toBeVisible({ timeout: 10000 });
  });

  test("should edit a customer", async ({ page }) => {
    await login(page);
    await page.goto("/customers");

    await expect(page.getByText("Teste Playwright")).toBeVisible({ timeout: 10000 });

    // Find the row and click edit. Wait for the list to fully settle first so
    // the row isn't shifting under us (previously caused a "not stable" timeout).
    await page.waitForLoadState("networkidle");
    const row = page.locator("div.rounded-2xl").filter({ hasText: "Teste Playwright" });
    const editBtn = row.locator('button[title="Editar"]');
    await editBtn.scrollIntoViewIfNeeded();
    // The floating "Suporte IA" button (fixed bottom-right, z-50) can overlap the
    // row action buttons, so dispatch the click directly to bypass the overlay.
    await editBtn.dispatchEvent("click");

    await expect(page.getByRole("heading", { name: "Editar Cliente" })).toBeVisible();

    await page.locator('input[placeholder="Nome completo"]').fill("Teste Editado PW");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Teste Editado PW")).toBeVisible({ timeout: 10000 });
  });

  test("should delete a customer", async ({ page }) => {
    await login(page);
    await page.goto("/customers");

    await expect(page.getByText("Teste Editado PW")).toBeVisible({ timeout: 10000 });

    page.on("dialog", (d) => d.accept());

    await page.waitForLoadState("networkidle");
    const row = page.locator("div.rounded-2xl").filter({ hasText: "Teste Editado PW" });
    const deleteBtn = row.locator('button[title="Excluir"]');
    await deleteBtn.scrollIntoViewIfNeeded();
    // Bypass the floating "Suporte IA" overlay (fixed bottom-right, z-50).
    await deleteBtn.dispatchEvent("click");

    await expect(page.getByText("Teste Editado PW")).not.toBeVisible({ timeout: 10000 });
  });

  test("should filter customers by search", async ({ page }) => {
    await login(page);
    await page.goto("/customers");

    const searchInput = page.getByPlaceholder("Buscar por nome, telefone, CPF ou e-mail...");
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill("xyznonexistent999");
    await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible({ timeout: 3000 });
  });
});
