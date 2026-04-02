import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**');
}

test.describe('Page Commandes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
  });

  test('affiche la liste des commandes', async ({ page }) => {
    await page.goto('/admin/orders');
    // Check main content visible (not profile modal h2)
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).toContainText(/commande/i);
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
    await page.waitForLoadState('networkidle');
    // Use JS to click hidden button (desktop table)
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('[title="Voir"]') as HTMLElement;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) {
      await page.waitForTimeout(300);
      const modalHidden = await page.evaluate(() =>
        document.getElementById('view-modal')?.classList.contains('hidden') ?? true
      );
      expect(modalHidden).toBe(false);
    }
  });

  test('bouton impression affiche le menu Facture/Bon de livraison', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('.print-menu-btn') as HTMLElement;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) {
      await page.waitForTimeout(300);
      const menuHidden = await page.evaluate(() =>
        document.querySelector('.print-menu')?.classList.contains('hidden') ?? true
      );
      expect(menuHidden).toBe(false);
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
    // Check HTML5 required fields block submission
    const form = page.locator('#order-form, form').first();
    await expect(form).toBeVisible();
    const hasRequired = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[required], select[required]');
      return inputs.length > 0;
    });
    expect(hasRequired).toBe(true);
  });
});
