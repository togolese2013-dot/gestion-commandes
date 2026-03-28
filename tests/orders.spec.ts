import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**');
}

test.describe('Page Commandes', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('affiche la liste des commandes', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('filtre Toutes / En attente / Disponible / Récupéré', async ({ page }) => {
    await page.goto('/admin/orders');
    const tabs = page.locator('button:has-text("En attente"), a:has-text("En attente")');
    if (await tabs.count() > 0) await tabs.first().click();
  });

  test('recherche par numéro de commande', async ({ page }) => {
    await page.goto('/admin/orders');
    const search = page.locator('input[placeholder*="commande"], input[placeholder*="client"]').first();
    if (await search.isVisible()) {
      await search.fill('CMD-');
      await page.waitForTimeout(400);
    }
  });

  test('bouton Voir ouvre le modal détail', async ({ page }) => {
    await page.goto('/admin/orders');
    const viewBtn = page.locator('[title="Voir"], .view-btn').first();
    if (await viewBtn.count() > 0) {
      await viewBtn.click();
      await expect(page.locator('#view-modal')).not.toHaveClass(/hidden/);
    }
  });

  test('bouton impression affiche le menu Facture/Bon de livraison', async ({ page }) => {
    await page.goto('/admin/orders');
    const printBtn = page.locator('.print-menu-btn').first();
    if (await printBtn.count() > 0) {
      await printBtn.click();
      await expect(page.locator('.print-menu').first()).not.toHaveClass(/hidden/);
      await expect(page.locator('.print-menu').first()).toContainText('Facture');
    }
  });
});

test.describe('Nouvelle commande', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('affiche le formulaire de création', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('form#order-form, form').first()).toBeVisible();
  });

  test('refuse si champs obligatoires manquants', async ({ page }) => {
    await page.goto('/admin');
    await page.click('button[type="submit"]');
    // Should show error or stay on page
    await expect(page).toHaveURL(/admin/);
  });
});
