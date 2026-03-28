import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**');
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('lien Dashboard fonctionne', async ({ page }) => {
    await page.click('a:has-text("Dashboard")');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('lien Commandes fonctionne', async ({ page }) => {
    await page.click('a:has-text("Commandes")');
    await expect(page).toHaveURL(/orders/);
  });

  test('lien Clients fonctionne', async ({ page }) => {
    await page.click('a:has-text("Clients")');
    await expect(page).toHaveURL(/clients/);
  });

  test('lien Paiements fonctionne (admin)', async ({ page }) => {
    await page.click('a:has-text("Paiements")');
    await expect(page).toHaveURL(/payments/);
  });

  test('lien Paramètres fonctionne (admin)', async ({ page }) => {
    await page.click('a:has-text("Paramètres")');
    await expect(page).toHaveURL(/settings/);
  });

  test('page 404 s\'affiche pour une URL inconnue', async ({ page }) => {
    await page.goto('/admin/page-inexistante-xyz');
    await expect(page.locator('body')).toContainText(/404|introuvable/i);
  });

  test('recherche globale affiche des résultats', async ({ page }) => {
    await page.goto('/admin/orders');
    const search = page.locator('#global-search');
    if (await search.isVisible()) {
      await search.fill('CMD');
      await page.waitForTimeout(400);
      await expect(page.locator('#global-results')).not.toHaveClass(/hidden/);
    }
  });

  test('toggle dark mode fonctionne', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.click('#dark-toggle');
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);
    await page.click('#dark-toggle');
    const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    expect(isLight).toBe(true);
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('affiche les KPIs', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.locator('body')).toContainText(/commande|client|total/i);
  });
});

test.describe('Clients', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('affiche la liste des clients', async ({ page }) => {
    await page.goto('/admin/clients');
    await expect(page.locator('body')).toContainText(/client/i);
  });
});

test.describe('Paiements', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('affiche l\'historique des paiements', async ({ page }) => {
    await page.goto('/admin/payments');
    await expect(page.locator('body')).toContainText(/paiement|encaissement|total/i);
  });
});

test.describe('Paramètres', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('affiche les sections Utilisateurs et Sauvegardes', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.locator('body')).toContainText(/utilisateur/i);
    await expect(page.locator('body')).toContainText(/sauvegarde/i);
  });
});
