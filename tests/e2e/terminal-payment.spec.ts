import { test, expect } from "@playwright/test";
import { login, addProductAndFinish } from "./helpers";

async function addProductAndOpenPayment(page: import("@playwright/test").Page) {
  // Add a product and finish the sale (handles variant products deterministically).
  await addProductAndFinish(page);

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

    // Reveal the payment-method picker. Scope to the "Pagamentos" row so we don't
    // hit the delivery section's own "Adicionar" button.
    await page
      .getByText("Pagamentos", { exact: true })
      .locator("..")
      .getByRole("button", { name: "Adicionar" })
      .click();

    // Choose the card method, enter an amount on the keypad, and confirm — this
    // registers a single CARD payment, which renders the terminal panel.
    await page.getByRole("button", { name: "Cartão" }).click();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();

    // The TerminalPaymentPanel renders for the single, auto-selected active
    // terminal. A lone terminal shows no name dropdown, so assert the panel's own
    // controls (the "Crédito" method button) instead of the terminal name.
    await expect(page.getByRole("button", { name: "Crédito" })).toBeVisible({ timeout: 5000 });

    // Send the charge to the stubbed terminal and expect the approval screen.
    await page.getByRole("button", { name: /Enviar para maquininha/i }).click();
    await expect(page.getByText(/Pagamento Aprovado!/i)).toBeVisible({ timeout: 10000 });
  });
});
