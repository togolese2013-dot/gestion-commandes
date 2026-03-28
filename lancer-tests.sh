#!/bin/bash

# ==============================================
# Script de lancement des tests - Gestion Commandes
# ==============================================

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Tests automatiques - Togolese      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check that the dev server is running
if ! curl -s http://localhost:4321 > /dev/null 2>&1; then
  echo "⚠️  Serveur non détecté sur localhost:4321"
  echo "→  Démarrage du serveur en arrière-plan..."
  npm run dev &
  SERVER_PID=$!
  echo "→  Attente démarrage (5s)..."
  sleep 5
else
  echo "✓ Serveur déjà actif sur localhost:4321"
  SERVER_PID=""
fi

echo ""
echo "Choisissez un mode de test :"
echo ""
echo "  1) Tous les tests (terminal)"
echo "  2) Interface graphique Playwright UI"
echo "  3) Tests auth uniquement"
echo "  4) Tests commandes uniquement"
echo "  5) Tests navigation uniquement"
echo "  6) Rapport HTML (dernier run)"
echo ""
read -p "Votre choix [1-6] : " choix

case $choix in
  1)
    echo ""
    echo "▶ Lancement de tous les tests..."
    npx playwright test
    ;;
  2)
    echo ""
    echo "▶ Ouverture de l'interface Playwright UI..."
    npx playwright test --ui
    ;;
  3)
    echo ""
    echo "▶ Tests d'authentification..."
    npx playwright test tests/auth.spec.ts
    ;;
  4)
    echo ""
    echo "▶ Tests des commandes..."
    npx playwright test tests/orders.spec.ts
    ;;
  5)
    echo ""
    echo "▶ Tests de navigation..."
    npx playwright test tests/navigation.spec.ts
    ;;
  6)
    echo ""
    echo "▶ Ouverture du rapport..."
    npx playwright show-report tests/report
    ;;
  *)
    echo "Choix invalide."
    ;;
esac

# Stop server if we started it
if [ -n "$SERVER_PID" ]; then
  echo ""
  echo "→ Arrêt du serveur (PID $SERVER_PID)..."
  kill $SERVER_PID 2>/dev/null
fi

echo ""
echo "✓ Terminé."
