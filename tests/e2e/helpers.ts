import { expect, type Page } from "@playwright/test";

/**
 * Logs in as the seeded admin and waits until we leave /login.
 * Login redirects ADMIN -> /dashboard and other roles -> /pdv, so we only
 * assert that the URL is no longer the login page (robust to that change).
 */
export async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@zapflow.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 10000,
  });
}

/**
 * Adds one product to the PDV cart and clicks "Finalizar Venda".
 *
 * Handles BOTH product shapes deterministically:
 *  - simple product  -> a single click adds it to the cart
 *  - variant product -> a size/color selector modal opens; we pick the first
 *    in-stock size (and color, when present) and confirm "Adicionar ao Carrinho"
 *
 * This avoids the previous flakiness where the helper blindly clicked the first
 * card and left the cart empty whenever that card happened to be a variant SKU.
 */
export async function addProductAndFinish(page: Page) {
  await page.goto("/pdv");

  // Click the first IN-STOCK product card (out-of-stock cards render as [disabled]).
  const card = page.locator("button.touch-target.group:not([disabled])").first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();

  // Variant products open a size/color modal. Detect it by the "Tamanho" label —
  // the confirm button reads "Selecione tamanho e cor" until a variant is chosen,
  // and only then becomes "Adicionar ao Carrinho".
  const tamanho = page.locator('label:has-text("Tamanho")');
  if (await tamanho.isVisible({ timeout: 1000 }).catch(() => false)) {
    // First in-stock size (out-of-stock sizes render as [disabled]).
    await page
      .locator('label:has-text("Tamanho") + div button:not([disabled])')
      .first()
      .click();
    // First in-stock color, only if a color selector is present.
    const color = page
      .locator('label:has-text("Cor") + div button:not([disabled])')
      .first();
    if (await color.isVisible({ timeout: 500 }).catch(() => false)) {
      await color.click();
    }
    const addBtn = page.getByRole("button", { name: "Adicionar ao Carrinho" });
    await expect(addBtn).toBeEnabled({ timeout: 3000 });
    await addBtn.click();
  }

  // A low-stock alert can overlay the sidebar buttons — dismiss it if shown.
  const dismiss = page.getByText("Dispensar Tudo");
  if (await dismiss.isVisible({ timeout: 500 }).catch(() => false)) {
    await dismiss.click();
  }

  const finishBtn = page.getByRole("button", { name: /Finalizar Venda/ });
  await expect(finishBtn).toBeEnabled({ timeout: 5000 });
  await finishBtn.click();
}
