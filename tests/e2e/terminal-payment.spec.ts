import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@zapflow.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 10000 });
}

async function addProductAndOpenPayment(page: import("@playwright/test").Page) {
  await page.goto("/pdv");
  await page.waitForTimeout(2000);

  // Click first enabled product card
  const productCard = page.locator("button.touch-target.group").first();
  await expect(productCard).toBeVisible({ timeout: 10000 });
  await productCard.click();

  await page.waitForTimeout(500);

  // Dismiss low-stock alert if visible
  const dismissBtn = page.getByText("Dispensar Tudo");
  if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dismissBtn.click();
  }

  // Click Finalizar Venda
  const finishBtn = page.getByRole("button", { name: /Finalizar Venda/ });
  await expect(finishBtn).toBeEnabled({ timeout: 3000 });
  await finishBtn.click();

  // Skip customer identification
  await expect(page.getByText("Identificar Cliente")).toBeVisible({ timeout: 5000 });
  await page.getByText("Pular - Venda sem cliente").click();

  // Payment modal should now be open
  await expect(page.getByText(/Total: R\$/)).toBeVisible({ timeout: 5000 });
}

test.describe.serial("Terminal Payment Flow", () => {
  test("sends charge to terminal and shows approval screen", async ({ page }) => {
    // Stub the terminal-charge POST to return a sent charge
    await page.route("**/api/checkout/terminal-charge", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ chargeId: "chg_e2e", status: "SENT" }),
        });
      } else {
        await route.continue();
      }
    });

    // Stub the terminal-charge status poll to return approved
    await page.route("**/api/checkout/terminal-charge/chg_e2e", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ approved: true, status: "APPROVED" }),
      });
    });

    // Stub the terminals list to return one active terminal
    await page.route("**/api/terminals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          terminals: [
            {
              id: "term_e2e",
              name: "Maquininha Teste",
              mp_device_id: "DEV_E2E",
              status: "ONLINE",
              location_label: null,
              is_active: true,
            },
          ],
        }),
      });
    });

    // Stub settings to allow installments
    await page.route("**/api/settings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ max_installments: "6" }),
      });
    });

    await login(page);
    await addProductAndOpenPayment(page);

    // Select the "Cartão / Maquininha" payment method tab if present
    const cardTab = page.getByRole("button", { name: /Cart[aã]o|Maquininha/i });
    if (await cardTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cardTab.click();
    }

    // The TerminalPaymentPanel should now render with the stubbed terminal
    await expect(page.getByText("Maquininha Teste")).toBeVisible({ timeout: 5000 });

    // Select Crédito method
    await page.getByRole("button", { name: /Crédito/i }).click();

    // Select 3x installments if the selector is visible
    const installmentSelect = page.locator("select").filter({ hasText: /3x/ });
    if (await installmentSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await installmentSelect.selectOption("3");
    } else {
      // Try selecting by value from the installments dropdown
      const select = page.locator("select").last();
      if (await select.isVisible({ timeout: 1000 }).catch(() => false)) {
        await select.selectOption("3");
      }
    }

    // Click "Enviar para maquininha"
    await page.getByRole("button", { name: /Enviar para maquininha/i }).click();

    // Assert the approval screen appears
    await expect(page.getByText(/Pagamento Aprovado!/i)).toBeVisible({ timeout: 10000 });
  });
});
