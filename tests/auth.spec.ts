import { test, expect } from '@playwright/test';

// Helper: login
async function login(page: any, username = 'admin', password = 'admin123') {
  await page.goto('/login');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**');
}

test.describe('Authentification', () => {
  test('affiche la page de connexion', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('refuse les mauvais identifiants', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'faux');
    await page.fill('input[name="password"]', 'faux');
    await page.click('button[type="submit"]');
    await expect(page.locator('body')).toContainText(/invalide|incorrect|erreur/i);
  });

  test('connexion réussie redirige vers admin', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/admin/);
  });

  test('déconnexion fonctionne', async ({ page }) => {
    await login(page);
    await page.click('button[type="submit"]:has-text("Déconnexion"), a:has-text("Déconnexion"), button:has-text("Déconnexion")');
    await expect(page).toHaveURL(/login/);
  });

  test('redirige vers login si non connecté', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/login/);
  });
});
