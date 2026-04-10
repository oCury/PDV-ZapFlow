import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@zapflow.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 10000 });
}

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

    // Find the row and click edit
    const row = page.locator(".rounded-2xl").filter({ hasText: "Teste Playwright" });
    await row.locator('button[title="Editar"]').click();

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

    const row = page.locator(".rounded-2xl").filter({ hasText: "Teste Editado PW" });
    await row.locator('button[title="Excluir"]').click();

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
