-- ============================================================================
-- SEED 003 : Compte administrateur complet
-- Description  : Prépare le profil admin, l'abonnement et le paiement
-- Prérequis    : L'utilisateur doit être créé dans Auth d'abord
--                (via Dashboard > Authentication > Users > Add User
--                 OU via le script Node.js create-admin.js)
-- ============================================================================

-- ⚠️ Remplacer 'ADMIN_USER_ID' par l'UUID réel après création dans Auth

-- 1. Mettre à jour le profil admin
-- UPDATE public.profiles
-- SET role = 'admin', status = 'active', full_name = 'Administrateur'
-- WHERE id = 'ADMIN_USER_ID';

-- 2. Attribuer l'accès à vie
-- INSERT INTO public.subscriptions (user_id, plan_id, status, activated_at)
-- SELECT 'ADMIN_USER_ID', id, 'active', NOW()
-- FROM public.plans
-- WHERE is_active = TRUE AND is_lifetime = TRUE
-- LIMIT 1;

-- 3. Enregistrer le paiement (gratuit pour l'admin)
-- INSERT INTO public.payments (user_id, amount, currency, status, payment_method, paid_at, reference, notes)
-- VALUES ('ADMIN_USER_ID', 0, 'MAD', 'completed', 'manual', NOW(), 'ADMIN-SEED', 'Compte administrateur initial');

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

-- Après exécution, vérifier avec :
-- SELECT p.email, p.full_name, p.role, p.status, s.status as sub_status, pa.status as payment_status
-- FROM public.profiles p
-- LEFT JOIN public.subscriptions s ON s.user_id = p.id AND s.status = 'active'
-- LEFT JOIN public.payments pa ON pa.user_id = p.id
-- WHERE p.role = 'admin';
