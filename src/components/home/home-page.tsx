"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/components/providers/theme-provider";
import { PasswordStrength } from "@/components/auth/password-strength";
import { HeroCarousel, type HeroSlide } from "@/components/home/hero-carousel";
import { toast } from "sonner";
import {
  Menu,
  X,
  Moon,
  Sun,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Check,
  Building2,
  Calendar,
  Wallet,
  Users,
  BarChart3,
  CreditCard,
  Server,
  MessageCircle,
  DoorOpen,
  Sparkles,
  Store,
  Mail,
  CheckCircle,
} from "lucide-react";

type Lang = "fr" | "en";

const messages: Record<Lang, Record<string, string>> = {
  fr: {
    // Header
    navFeatures: "Fonctionnalités",
    navModules: "Modules",
    navPricing: "Tarifs",
    navFaq: "FAQ",
    contactTeam: "Contacter l'équipe",
    // Hero
    badge: "Solution tout-en-un pour hôtels & résidences",
    heroTitle: "La gestion simple de vos résidences et hôtels",
    heroSubtitle:
      "Zéro frais d'installation. Suivez vos paiements, vos équipes et votre caisse, jour après jour.",
    dashboardPreview: "Tableau de bord gérant en temps réel",
    dashboardPreviewDesc: "Suivi des chambres libres, caisse & réservations",
    car1Badge: "SOLUTION TOUT-EN-UN",
    car1Title: "Une seule plateforme pour hôtels & résidences",
    car1Desc:
      "Zéro frais d'installation. Suivez vos paiements, vos équipes et votre caisse, jour après jour.",
    car2Badge: "TABLEAU DE BORD EN TEMPS RÉEL",
    car2Title: "Chambres libres, caisse & réservations",
    car2Desc: "Voyez en un coup d'œil qui arrive, qui part, et combien d'argent est entré aujourd'hui.",
    car3Badge: "GESTION DE CAISSE",
    car3Title: "Chaque entrée & sortie notée",
    car3Desc:
      "Enregistrez vos paiements en espèces ou Mobile Money (Orange, MTN, Moov, Wave).",
    car4Badge: "ÉQUIPES & SERVICES",
    car4Title: "Ménage, facturation, réservations",
    car4Desc: "Coordonnez vos équipes et automatisez vos factures en quelques clics.",
    dataProtected: "Vos données sont protégées et confidentielles",
    umoaCompliant: "Conforme aux règles bancaires de la région (UMOA)",
    // Auth
    signIn: "Connexion",
    signUp: "Inscription",
    managerSpace: "Espace Gérant",
    createAccount: "Créer un compte",
    email: "Email professionnel",
    password: "Mot de passe",
    rememberMe: "Se souvenir de moi",
    forgotPassword: "Mot de passe oublié ?",
    loginBtn: "Se connecter",
    confirmPassword: "Confirmer le mot de passe",
    signUpBtn: "S'inscrire",
    noCardRequired: "Sans carte bancaire requise. 1 mois offert.",
    acceptTerms: "J'accepte les",
    terms: "CGU",
    privateInfo: "Vos informations restent privées",
    // Footer
    footerRights: "© 2026 Séjoura by Refontiq.",
    footerContact: "Abidjan, Côte d'Ivoire",
    footerPowered: "Une solution",
    // Modal
    closeModal: "Fermer & Revenir au portail",
    // Validation
    emailInvalid: "Adresse e-mail invalide.",
    passwordShort: "Le mot de passe doit comporter au moins 6 caractères.",
    passwordMismatch: "Les mots de passe ne correspondent pas.",
    termsError: "Vous devez accepter les conditions d'utilisation.",
    verifyEmail: "Compte créé ! Vérifiez votre e-mail pour activer votre compte.",
    loginError: "Adresse e-mail ou mot de passe incorrect.",
    signupError: "Une erreur est survenue lors de l'inscription.",
    generalError: "Une erreur est survenue. Veuillez réessayer.",
    loginSuccess: "Connexion réussie !",
    signupSuccess: "Compte créé avec succès !",
    signing: "Connexion en cours...",
    creating: "Création du compte...",
    or: "ou",
    signInWith: "Se connecter avec Google",
    magicLink: "Recevoir un lien magique",
    magicLinkSent: "Lien envoyé ! Vérifiez votre boîte mail.",
    magicLinkBtn: "Envoyer le lien",
    signUpWith: "Continuer avec Google",
    // Misc
    langLabel: "Langue",
    themeToggle: "Changer le thème",
    menuToggle: "Ouvrir le menu",
    features: "Fonctionnalités",
    modules: "Modules",
    pricing: "Tarifs",
    faq: "FAQ",
  },
  en: {
    navFeatures: "Features",
    navModules: "Modules",
    navPricing: "Pricing",
    navFaq: "FAQ",
    contactTeam: "Contact Team",
    badge: "All-in-one solution for hotels & residences",
    heroTitle: "Simple management for your residences and hotels",
    heroSubtitle:
      "Zero setup fees. Track your payments, your teams and your cash, day after day.",
    dashboardPreview: "Real-time manager dashboard",
    dashboardPreviewDesc: "Track available rooms, cash & reservations",
    car1Badge: "ALL-IN-ONE SOLUTION",
    car1Title: "One platform for hotels & residences",
    car1Desc: "Zero setup fees. Track your payments, your teams and your cash, day after day.",
    car2Badge: "REAL-TIME DASHBOARD",
    car2Title: "Available rooms, cash & bookings",
    car2Desc: "See at a glance who arrives, who leaves, and how much money came in today.",
    car3Badge: "CASH MANAGEMENT",
    car3Title: "Every entry & exit recorded",
    car3Desc: "Record payments in cash or Mobile Money (Orange, MTN, Moov, Wave).",
    car4Badge: "TEAMS & SERVICES",
    car4Title: "Cleaning, invoicing, bookings",
    car4Desc: "Coordinate your teams and automate your invoices in a few clicks.",
    dataProtected: "Your data is protected and confidential",
    umoaCompliant: "Compliant with regional banking rules (UMOA)",
    signIn: "Sign in",
    signUp: "Sign up",
    managerSpace: "Manager Space",
    createAccount: "Create account",
    email: "Professional email",
    password: "Password",
    rememberMe: "Remember me",
    forgotPassword: "Forgot password?",
    loginBtn: "Sign in",
    confirmPassword: "Confirm password",
    signUpBtn: "Sign up",
    noCardRequired: "No credit card required. 1 month free.",
    acceptTerms: "I accept the",
    terms: "Terms",
    privateInfo: "Your information stays private",
    footerRights: "© 2026 Séjoura by Refontiq.",
    footerContact: "Abidjan, Côte d'Ivoire",
    footerPowered: "A solution by",
    closeModal: "Close & Return to portal",
    emailInvalid: "Invalid email address.",
    passwordShort: "Password must be at least 6 characters.",
    passwordMismatch: "Passwords do not match.",
    termsError: "You must accept the terms and conditions.",
    verifyEmail: "Account created! Check your email to activate your account.",
    loginError: "Incorrect email or password.",
    signupError: "An error occurred during registration.",
    generalError: "An error occurred. Please try again.",
    loginSuccess: "Login successful!",
    signupSuccess: "Account created successfully!",
    signing: "Signing in...",
    creating: "Creating account...",
    or: "or",
    signInWith: "Sign in with Google",
    magicLink: "Get a magic link",
    magicLinkSent: "Link sent! Check your inbox.",
    magicLinkBtn: "Send link",
    signUpWith: "Continue with Google",
    langLabel: "Language",
    themeToggle: "Toggle theme",
    menuToggle: "Open menu",
    features: "Features",
    modules: "Modules",
    pricing: "Pricing",
    faq: "FAQ",
  },
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type SectionName = "Fonctionnalités" | "Modules" | "Tarifs" | "FAQ" | null;

export function HomePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggle: toggleLang } = useLanguage();
  const t = messages[lang];

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAuthOpen, setMobileAuthOpen] = useState(false);
  const [mobileAuthMode, setMobileAuthMode] = useState<"login" | "signup">("login");
  const [activeSection, setActiveSection] = useState<SectionName>(null);
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup" | null>(null);

  // Hydration-safe detection du montage côté client (SSR)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const logoClicks = useRef(0);
  const logoResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal focus trap refs
  const modalRef = useRef<HTMLDivElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close modal on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activeSection) {
          setActiveSection(null);
        }
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSection, mobileMenuOpen]);

  // Focus trap for modal
  useEffect(() => {
    if (activeSection && modalCloseRef.current) {
      modalCloseRef.current.focus();

      function trapFocus(e: KeyboardEvent) {
        if (e.key !== "Tab" || !modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      window.addEventListener("keydown", trapFocus);
      return () => window.removeEventListener("keydown", trapFocus);
    }
  }, [activeSection]);

  // Lock body scroll when modal or mobile menu is open
  useEffect(() => {
    if (activeSection || mobileMenuOpen || authModalMode) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeSection, mobileMenuOpen, authModalMode]);

  // Prefill email if "remember me" was checked previously
  useEffect(() => {
    const savedEmail = localStorage.getItem("sejoura-remember-email");
    if (savedEmail) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(savedEmail);
      setRemember(true);
    }
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  function openSection(section: SectionName) {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }

  // Accès super admin masqué : 4 clics rapides sur le logo Séjoura
  function handleLogoClick() {
    logoClicks.current += 1;
    if (logoResetTimer.current) clearTimeout(logoResetTimer.current);
    logoResetTimer.current = setTimeout(() => {
      logoClicks.current = 0;
    }, 1200);
    if (logoClicks.current >= 4) {
      logoClicks.current = 0;
      localStorage.setItem("sejoura_admin_intent", "/admin/dashboard");
      window.open("/admin/dashboard", "_blank");
    }
  }

  async function handleGoogleAuth() {
    setLoading(true);
    try {
      const supabase = createClient();
      // Use redirect flow (not popup) — works in PWA and on mobile
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          queryParams: {
            // Force redirect flow (no popup)
            prompt: "consent",
          },
        },
      });
      if (error) {
        const message = (error.message || "").toLowerCase();
        if (
          message.includes("provider") ||
          message.includes("not enabled") ||
          message.includes("configuration") ||
          message.includes("n'est pas activé") ||
          message.includes("pas activée")
        ) {
          toast.error(
            lang === "fr"
              ? "La connexion Google n'est pas encore activée. Contactez l'équipe Séjoura."
              : "Google sign-in is not enabled yet. Contact the Séjoura team."
          );
        } else {
          toast.error(t.generalError);
        }
      }
      // Note: setLoading(false) not needed — the page redirects
    } catch {
      toast.error(t.generalError);
      setLoading(false);
    }
  }

  // Magic Link: send a login link by email
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  async function handleMagicLink() {
    const emailToUse = magicLinkEmail.trim() || email;
    if (!isValidEmail(emailToUse)) {
      toast.error(t.emailInvalid);
      return;
    }
    setMagicLinkLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: emailToUse,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        const message = (error.message || "").toLowerCase();
        if (message.includes("rate limit") || message.includes("over")) {
          toast.error(
            lang === "fr"
              ? "Trop de tentatives. Réessayez dans quelques minutes."
              : "Too many attempts. Try again in a few minutes."
          );
        } else {
          toast.error(t.generalError);
        }
      } else {
        setMagicLinkSent(true);
        toast.success(t.magicLinkSent);
      }
    } catch {
      toast.error(t.generalError);
    } finally {
      setMagicLinkLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    clearErrors();

    const newErrors: typeof errors = {};
    if (!isValidEmail(email)) newErrors.email = t.emailInvalid;
    if (password.length < 6) newErrors.password = t.passwordShort;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error(lang === "fr" ? "Veuillez corriger les erreurs." : "Please fix the errors.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // Messages précis selon la cause : compte non confirmé, compte inexistant, etc.
        const code = (authError as { code?: string }).code || "";
        const message = (authError.message || "").toLowerCase();

        if (code === "email_not_confirmed" || message.includes("email not confirmed") || message.includes("non confirmé")) {
          toast.error(
            lang === "fr"
              ? "Votre e-mail n'est pas encore confirmé. Vérifiez votre boîte de réception (et vos spams)."
              : "Your email is not confirmed yet. Check your inbox (and spam)."
          );
        } else if (message.includes("rate limit") || message.includes("trop de tentatives")) {
          toast.error(
            lang === "fr"
              ? "Trop de tentatives récentes. Veuillez réessayer dans quelques minutes."
              : "Too many recent attempts. Please try again in a few minutes."
          );
        } else {
          toast.error(t.loginError);
        }
        setLoading(false);
        return;
      }

      // Utilise la session renvoyée par signInWithPassword : un appel
      // getSession() immédiat peut renvoyer null pendant que les cookies
      // se propagent, ce qui dégradait la navigation post-connexion.
      const session = authData.session;
      let targetRoute = "/dashboard";
      if (session) {
        const { data: userData } = await supabase
          .from("users")
          .select("role")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (userData?.role === "menagere") {
          targetRoute = "/menage";
        } else if (userData?.role === "super_admin") {
          targetRoute = "/admin/dashboard";
        }
      }

      // Intention super admin mémorisée (localStorage, partagé entre onglets)
      const adminIntent = localStorage.getItem("sejoura_admin_intent");
      if (targetRoute !== "/menage" && adminIntent === "/admin/dashboard") {
        localStorage.removeItem("sejoura_admin_intent");
        targetRoute = "/admin/dashboard";
      }

      toast.success(t.loginSuccess);
      if (remember) {
        localStorage.setItem("sejoura-remember-email", email);
      } else {
        localStorage.removeItem("sejoura-remember-email");
      }
      setEmail("");
      setPassword("");
      setTimeout(() => router.push(targetRoute), 800);
    } catch {
      toast.error(t.generalError);
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    clearErrors();

    const newErrors: typeof errors = {};
    if (!isValidEmail(email)) newErrors.email = t.emailInvalid;
    if (password.length < 6) newErrors.password = t.passwordShort;
    if (password !== confirmPassword) newErrors.confirmPassword = t.passwordMismatch;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error(lang === "fr" ? "Veuillez corriger les erreurs." : "Please fix the errors.");
      return;
    }

    if (!agreeTerms) {
      toast.error(t.termsError);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: "admin_residence",
          },
        },
      });

      if (authError) {
        // Afficher l'erreur réelle au lieu d'un message générique : le motif le
        // plus courant est « un compte existe déjà » (la table auth.users n'est
        // pas vidée par une réinitialisation du schéma public).
        const code = (authError as { code?: string }).code || "";
        const message = (authError.message || "").toLowerCase();

        if (code === "user_already_exists" || message.includes("already registered") || message.includes("déjà")) {
          toast.error(
            lang === "fr"
              ? "Un compte existe déjà avec cette adresse e-mail. Connectez-vous."
              : "An account already exists with this email. Please sign in."
          );
          setMode("login");
        } else if (message.includes("rate limit") || message.includes("trop de tentatives")) {
          toast.error(
            lang === "fr"
              ? "Trop de tentatives récentes. Veuillez réessayer dans quelques minutes."
              : "Too many recent attempts. Please try again in a few minutes."
          );
        } else if (message.includes("invalid email") || message.includes("e-mail invalide")) {
          toast.error(t.emailInvalid);
        } else {
          console.error("Erreur inscription Supabase :", authError);
          toast.error(t.signupError);
        }
        setLoading(false);
        return;
      }

      if (data.session) {
        // Compte créé et connecté : l'étape 2 (configuration de l'établissement)
        // s'affiche automatiquement dans le tableau de bord.
        toast.success(t.signupSuccess);
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setAgreeTerms(false);
        setLoading(false);
        setTimeout(() => router.push("/dashboard"), 800);
        return;
      }

      // Confirmation par e-mail requise
      toast.success(t.verifyEmail);
      setPassword("");
      setConfirmPassword("");
      setAgreeTerms(false);
      setErrors({});
      setMode("login");
      setLoading(false);
    } catch {
      toast.error(t.generalError);
      setLoading(false);
    }
  }

  // Modal content
  const modalContent: Record<string, React.ReactNode> = {
    Fonctionnalités: (
      <div className="space-y-3">
        <h4 className="font-bold text-blue-600 dark:text-blue-400 text-base mb-3 border-b border-slate-200 dark:border-[#404040] pb-2">
          {lang === "fr" ? "Ce qui rend Séjoura unique" : "What makes Séjoura unique"}
        </h4>
        <ul className="space-y-3 text-sm">
          {[
            {
              icon: Calendar,
              title: lang === "fr" ? "Tarification dynamique" : "Dynamic pricing",
              desc:
                lang === "fr"
                  ? "Prix ajustés automatiquement selon la saison, les week-ends, les jours fériés et le taux d'occupation. Maximisez vos revenus sans effort."
                  : "Prices automatically adjusted based on season, weekends, holidays and occupancy rate. Maximize your revenue effortlessly.",
            },
            {
              icon: Sparkles,
              title: lang === "fr" ? "Suggestions IA" : "AI suggestions",
              desc:
                lang === "fr"
                  ? "Un moteur intelligent analyse vos données et vous suggère des actions concrètes : tâches de ménage en retard, chambres à publier, baisse d'occupation à anticiper."
                  : "An intelligent engine analyzes your data and suggests concrete actions: overdue cleaning, rooms to publish, occupancy drops to anticipate.",
            },
            {
              icon: BarChart3,
              title: lang === "fr" ? "Détection d'anomalies" : "Anomaly detection",
              desc:
                lang === "fr"
                  ? "Séjoura détecte automatiquement les surpaiements, sous-paiements, paiements en double et écarts de prix — vous êtes alerté avant qu'il ne soit trop tard."
                  : "Séjoura automatically detects overpayments, underpayments, duplicate payments and price discrepancies — you're alerted before it's too late.",
            },
            {
              icon: Sparkles,
              title: lang === "fr" ? "Ménage automatique" : "Automatic cleaning",
              desc:
                lang === "fr"
                  ? "Le départ d'un client crée la tâche de nettoyage dans un pool partagé. La première ménagère disponible la prend. Alerte automatique après 1h30."
                  : "A client checkout creates the cleaning task in a shared pool. The first available cleaner picks it up. Automatic alert after 1h30.",
            },
            {
              icon: CreditCard,
              title: lang === "fr" ? "Espace client mobile" : "Mobile client portal",
              desc:
                lang === "fr"
                  ? "Chaque client reçoit une page séjour privée sur son téléphone : infos du séjour, demandes de services et suivi du paiement."
                  : "Each client receives a private stay page on their phone: stay info, service requests and payment tracking.",
            },
            {
              icon: Wallet,
              title: lang === "fr" ? "Caisse & Shift en temps réel" : "Real-time cash & shift",
              desc:
                lang === "fr"
                  ? "Suivez chaque mouvement de caisse en temps réel : encaissements, décaissements, journal complet avec horodatage."
                  : "Track every cash movement in real time: receipts, disbursements, complete timestamped journal.",
            },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <strong className="text-slate-900 dark:text-[#e8e8e8]">{item.title} :</strong>{" "}
                <span className="text-slate-600 dark:text-[#c0c0c0]">{item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 dark:text-[#a0a0a0] border-t border-slate-200 dark:border-[#404040] pt-3">
          {lang === "fr"
            ? "Toutes ces fonctionnalités sont incluses dans chaque plan, dès l'essai gratuit."
            : "All these features are included in every plan, from the free trial."}
        </p>
      </div>
    ),
    Modules: (
      <div className="space-y-3">
        <h4 className="font-bold text-blue-600 dark:text-blue-400 text-base mb-3 border-b border-slate-200 dark:border-[#404040] pb-2">
          {lang === "fr" ? "Les modules du dashboard" : "Dashboard modules"}
        </h4>
        <ul className="space-y-3 text-sm">
          {[
            {
              icon: Calendar,
              title: lang === "fr" ? "Réservations & calendrier" : "Reservations & calendar",
              desc:
                lang === "fr"
                  ? "Créez, modifiez et suivez toutes vos réservations. Anti double-booking, demandes de prolongation et statuts en temps réel."
                  : "Create, modify and track all your reservations. Anti double-booking, extension requests and real-time statuses.",
            },
            {
              icon: Building2,
              title: lang === "fr" ? "Chambres & types" : "Rooms & types",
              desc:
                lang === "fr"
                  ? "Gérez vos types de chambres, grilles tarifaires, photos et disponibilités. Suivi du statut de chaque chambre."
                  : "Manage your room types, pricing grids, photos and availability. Track the status of every room.",
            },
            {
              icon: Wallet,
              title: lang === "fr" ? "Comptabilité & factures PDF" : "Accounting & PDF invoices",
              desc:
                lang === "fr"
                  ? "Dépenses, rapports mensuels, factures et reçus PDF générés en un clic. Journal d'audit complet."
                  : "Expenses, monthly reports, invoices and PDF receipts generated in one click. Complete audit trail.",
            },
            {
              icon: Users,
              title: lang === "fr" ? "Employés & auth par PIN" : "Employees & PIN auth",
              desc:
                lang === "fr"
                  ? "Créez des comptes réceptionnistes et ménagères. Chacun se connecte avec un code PIN — pas besoin de compte email."
                  : "Create receptionist and cleaner accounts. Each one signs in with a PIN — no email account needed.",
            },
            {
              icon: Store,
              title: lang === "fr" ? "Trouvetou — mise en ligne" : "Trouvetou — listing",
              desc:
                lang === "fr"
                  ? "Publiez vos chambres sur la vitrine Trouvetou avec photos, prix et disponibilités. Les réservations arrivent sur WhatsApp."
                  : "List your rooms on the Trouvetou showcase with photos, prices and availability. Bookings arrive on WhatsApp.",
            },
            {
              icon: Server,
              title: lang === "fr" ? "API & intégrations" : "API & integrations",
              desc:
                lang === "fr"
                  ? "Endpoints REST pour connecter votre site web ou vos applications tierces. Disponibilités, réservations et annulations."
                  : "REST endpoints to connect your website or third-party apps. Availability, bookings and cancellations.",
            },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <strong className="text-slate-900 dark:text-[#e8e8e8]">{item.title} :</strong>{" "}
                <span className="text-slate-600 dark:text-[#c0c0c0]">{item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ),
    Tarifs: (
      <div className="space-y-5">
        <h4 className="font-bold text-blue-600 dark:text-blue-400 text-base mb-3 border-b border-slate-200 dark:border-[#404040] pb-2">
          {lang === "fr" ? "Des tarifs simples. Zéro piège." : "Simple pricing. No tricks."}
        </h4>
        <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 mb-5">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {lang === "fr"
              ? "1 mois offert à l'inscription, sans carte bancaire. Annulable à tout moment."
              : "1 month free at signup, no credit card required. Cancel anytime."}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Essentiel */}
          <div className="bg-slate-50 dark:bg-[#262626]/60 p-6 rounded-2xl border border-slate-200 dark:border-[#404040]">
            <h5 className="font-black text-slate-900 dark:text-[#e8e8e8] text-xl">
              {lang === "fr" ? "Essentiel" : "Essentiel"}
            </h5>
            <p className="text-slate-500 dark:text-[#a0a0a0] text-xs mb-4">
              {lang === "fr" ? "1 établissement maximum" : "Up to 1 establishment"}
            </p>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mb-4">
              15 000 F <span className="text-xs font-semibold text-slate-500">/mois</span>
            </div>
            <ul className="text-sm space-y-3 text-slate-700 dark:text-[#c0c0c0]">
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "1 admin + 1 réceptionniste" : "1 admin + 1 receptionist"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "10 unités maximum" : "Up to 10 units"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Réservations et check-in/out" : "Reservations and check-in/out"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Comptabilité de base" : "Basic accounting"}
              </li>
            </ul>
          </div>
          {/* Entreprise */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border-2 border-blue-500 shadow-lg shadow-blue-100 dark:shadow-blue-900/20 relative">
            <span className="absolute -top-3 left-6 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {lang === "fr" ? "Le plus choisi" : "Most chosen"}
            </span>
            <h5 className="font-black text-slate-900 dark:text-[#e8e8e8] text-xl mt-1">
              Entreprise
            </h5>
            <p className="text-slate-500 dark:text-[#a0a0a0] text-xs mb-4">
              {lang === "fr" ? "Établissements illimités & API" : "Unlimited establishments & API"}
            </p>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mb-4">
              55 000 F <span className="text-xs font-semibold text-slate-500">/mois</span>
            </div>
            <ul className="text-sm space-y-3 text-slate-700 dark:text-[#c0c0c0]">
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Établissements & utilisateurs illimités" : "Unlimited establishments & users"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Module ménage automatique & vitrine Trouvetou" : "Automatic cleaning & Trouvetou showcase"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Paiement en ligne Wave" : "Wave online payment"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "API & notifications WhatsApp" : "API & WhatsApp notifications"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Rapports consolidés & support dédié 24/7" : "Consolidated reports & dedicated 24/7 support"}
              </li>
            </ul>
          </div>
        </div>
      </div>
    ),
    FAQ: (
      <div className="space-y-3">
        <h4 className="font-bold text-blue-600 dark:text-blue-400 text-base mb-4 border-b border-slate-200 dark:border-[#404040] pb-2">
          {lang === "fr" ? "Questions fréquentes" : "Frequently asked questions"}
        </h4>
        <div className="space-y-3 text-sm">
          {[
            {
              q: lang === "fr" ? "C'est quoi Séjoura ?" : "What is Séjoura?",
              a:
                lang === "fr"
                  ? "Un logiciel simple pour gérer votre hôtel ou votre résidence meublée : réservations, factures, paiements et personnel, le tout au même endroit."
                  : "A simple software to manage your hotel or furnished residence: reservations, invoices, payments and staff, all in one place.",
            },
            {
              q: lang === "fr" ? "Frais d'installation ?" : "Setup fees?",
              a:
                lang === "fr"
                  ? "Non. Séjoura ne facture aucun frais pour démarrer. Vous payez seulement votre abonnement mensuel."
                  : "No. Séjoura charges no fees to start. You only pay your monthly subscription.",
            },
            {
              q: lang === "fr" ? "L'essai gratuit dure combien de temps ?" : "How long is the free trial?",
              a:
                lang === "fr"
                  ? "1 mois offert dès l'inscription, sans carte bancaire et sans engagement. À la fin de l'essai, vous choisissez l'offre Essentiel (15 000 FCFA/mois) ou Entreprise (55 000 FCFA/mois)."
                  : "1 month free at signup, no credit card and no commitment. At the end of the trial, you choose Essentiel (15,000 XOF/month) or Entreprise (55,000 XOF/month).",
            },
            {
              q: lang === "fr" ? "Différence entre les offres ?" : "Difference between the plans?",
              a:
                lang === "fr"
                  ? "Le plan Essentiel (15 000 FCFA/mois) convient jusqu'à 1 établissement avec 1 admin et 1 réceptionniste. Le plan Entreprise (55 000 FCFA/mois) ajoute les établissements illimités, le module ménage automatique, la vitrine Trouvetou, le paiement en ligne Wave, l'accès API et un support dédié 24/7."
                  : "The Essentiel plan (15,000 XOF/month) suits up to 1 establishment with 1 admin and 1 receptionist. The Entreprise plan (55,000 XOF/month) adds unlimited establishments, automatic cleaning, the Trouvetou showcase, Wave online payment, API access and dedicated 24/7 support.",
            },
            {
              q: lang === "fr" ? "Comment mes clients paient-ils ?" : "How do my clients pay?",
              a:
                lang === "fr"
                  ? "Vos clients paient en espèces ou par Mobile Money (Orange, MTN, Moov, Wave) directement avec vous — vous enregistrez le paiement dans Séjoura en un clic. Le paiement en ligne par vos clients arrivera bientôt avec le plan Entreprise."
                  : "Your clients pay in cash or via Mobile Money (Orange, MTN, Moov, Wave) directly with you — you record the payment in Séjoura in one click. Online payment by your clients is coming soon with the Entreprise plan.",
            },
            {
              q: lang === "fr" ? "Ai-je besoin d'un site web ?" : "Do I need a website?",
              a:
                lang === "fr"
                  ? "Non. Séjoura fonctionne même sans site web. Avec le plan Entreprise, votre site peut se connecter à Séjoura pour vérifier les disponibilités et créer des réservations."
                  : "No. Séjoura works even without a website. With the Entreprise plan, your site can connect to Séjoura to check availability and create bookings.",
            },
            {
              q: lang === "fr" ? "Mes données sont-elles en sécurité ?" : "Is my data safe?",
              a:
                lang === "fr"
                  ? "Oui. Vos informations et celles de vos clients sont protégées et ne sont jamais visibles par un autre établissement."
                  : "Yes. Your information and your clients' data are protected and never visible to other establishments.",
            },
            {
              q: lang === "fr" ? "Puis-je annuler mon abonnement ?" : "Can I cancel my subscription?",
              a: lang === "fr" ? "Oui, sans engagement ni pénalité." : "Yes, no commitment or penalty.",
            },
            {
              q: lang === "fr" ? "Combien de temps pour apprendre ?" : "How long to learn?",
              a:
                lang === "fr"
                  ? "Quelques minutes. Une première réservation peut être créée en moins de 2 minutes, sans formation nécessaire."
                  : "A few minutes. A first reservation can be created in under 2 minutes, no training needed.",
            },
            {
              q: lang === "fr" ? "C'est quoi une « API » ?" : "What is an \"API\"?",
              a:
                lang === "fr"
                  ? "C'est un outil technique qui permet à votre site web de se connecter directement à Séjoura. Utile seulement si vous avez déjà un développeur."
                  : "A technical tool that lets your website connect directly to Séjoura. Only useful if you have a developer.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-slate-50 dark:bg-[#262626]/60 p-3.5 rounded-xl border border-slate-100 dark:border-[#404040]"
            >
              <strong className="text-slate-900 dark:text-[#e8e8e8] block mb-1">{item.q}</strong>
              <p className="text-slate-600 dark:text-[#c0c0c0]">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  };

  const navItems = [
    { label: t.navFeatures, section: "Fonctionnalités" as const },
    { label: t.navModules, section: "Modules" as const },
    { label: t.navPricing, section: "Tarifs" as const },
    { label: t.navFaq, section: "FAQ" as const },
  ];

  const heroSlides: HeroSlide[] = [
    {
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=400&auto=format&fit=crop",
      badge: t.car1Badge,
      title: t.car1Title,
      desc: t.car1Desc,
    },
    {
      image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?q=80&w=400&auto=format&fit=crop",
      badge: t.car2Badge,
      title: t.car2Title,
      desc: t.car2Desc,
    },
    {
      image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=400&auto=format&fit=crop",
      badge: t.car3Badge,
      title: t.car3Title,
      desc: t.car3Desc,
    },
    {
      image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=400&auto=format&fit=crop",
      badge: t.car4Badge,
      title: t.car4Title,
      desc: t.car4Desc,
    },
  ];

  return (
    <div className="relative h-screen w-full overflow-y-auto flex flex-col justify-between py-2 px-4 sm:px-6 md:px-12 text-white">
      {/* Full-screen panoramic background with dark overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1920&auto=format&fit=crop)" }}>
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/60 backdrop-blur-sm" />
      </div>

      {/* Skip link for accessibility - rendered after client mount to avoid hydration mismatch */}
      {mounted && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm"
        >
          {lang === "fr" ? "Aller au contenu principal" : "Skip to main content"}
        </a>
      )}

      {/* Header */}
      <header className="relative z-20 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-1.5 sm:py-2 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleLogoClick}
            className="cursor-pointer bg-transparent border-0 p-0"
            aria-label="Séjoura"
          >
            <Image
              src="/logo-sejoura.png"
              alt="Séjoura"
              width={200}
              height={64}
              className="object-contain h-16 sm:h-20 w-auto brightness-0 invert"
              priority
            />
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav
          className="hidden md:flex items-center space-x-6 text-xs font-semibold text-white/80 bg-white/10 backdrop-blur-md px-5 py-2 rounded-full border border-white/20 shadow-lg"
          aria-label={lang === "fr" ? "Navigation principale" : "Main navigation"}
        >
          {navItems.map((item) => (
            <button
              key={item.section}
              onClick={() => openSection(item.section)}
              className="hover:text-white transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-white/10 backdrop-blur-md text-white/80 border border-white/20 hover:bg-white/20 transition-colors"
            aria-label={t.langLabel}
          >
            {lang === "fr" ? "FR" : "EN"}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-white/10 backdrop-blur-md text-white/80 border border-white/20 hover:bg-white/20 transition-colors"
            aria-label={t.themeToggle}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
          </button>

          {/* WhatsApp contact */}
          <a
            href="https://wa.me/2250100372900"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex px-3.5 py-2 bg-[#25D366] hover:bg-[#1DA851] text-white text-xs font-bold rounded-xl items-center gap-2 transition-all shadow-lg"
          >
            <MessageCircle className="w-4 h-4" />
            {t.contactTeam}
          </a>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-white/10 backdrop-blur-md text-white/80 border border-white/20 hover:bg-white/20 transition-colors"
            aria-label={t.menuToggle}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-menu"
          className="md:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute top-0 right-0 w-72 h-full bg-white dark:bg-[#1a1a1a] shadow-2xl p-6 animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold text-slate-900 dark:text-[#e8e8e8]">
                {lang === "fr" ? "Menu" : "Menu"}
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2e2e2e]"
                aria-label="Fermer le menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex flex-col space-y-3" aria-label={lang === "fr" ? "Navigation mobile" : "Mobile navigation"}>
              {navItems.map((item) => (
                <button
                  key={item.section}
                  onClick={() => openSection(item.section)}
                  className="text-left px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 dark:text-[#c0c0c0] bg-slate-50 dark:bg-[#262626] hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <a
                href="https://wa.me/2250100372900"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 px-4 py-3 bg-[#25D366] hover:bg-[#1DA851] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                {t.contactTeam}
              </a>
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main
        id="main-content"
        className="relative z-10 w-full max-w-[1200px] mx-auto flex-1 flex items-center justify-center px-4 sm:px-6 py-1 sm:py-3"
      >
        <div className="relative w-full flex flex-col lg:flex-row items-center lg:items-stretch gap-4 lg:gap-10 min-h-0 lg:min-h-[500px]">
          {/* Left side — Hero title + dynamic carousel */}
          <div className="relative lg:flex-1 flex flex-col justify-center text-white">
            <div className="flex flex-col gap-4 sm:gap-8 max-w-xl">
              <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight tracking-tight drop-shadow-lg">
                {t.heroTitle}
              </h1>

              <HeroCarousel slides={heroSlides} />
            </div>
          </div>

          {/* Right side — Floating auth card (desktop) */}
          <div className="relative hidden md:flex w-full sm:w-[400px] lg:w-5/12 xl:w-[420px] bg-white dark:bg-[#1a1a1a] rounded-3xl shadow-2xl p-5 sm:p-5 flex-col justify-between border border-slate-200 dark:border-[#333333] max-h-[calc(100vh-100px)] overflow-y-auto">
            {/* Tab switcher */}
            <div>
              <div
                className="flex bg-slate-100 dark:bg-[#262626] p-1.5 sm:p-1.5 rounded-2xl sm:rounded-xl mb-4 border border-slate-200 dark:border-[#333333]"
                role="tablist"
                aria-label={lang === "fr" ? "Authentification" : "Authentication"}
              >
                <button
                  onClick={() => setMode("login")}
                  className={`flex-1 py-3 sm:py-2 px-3 text-sm sm:text-xs font-bold rounded-xl sm:rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                    mode === "login"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-400/30"
                      : "text-slate-500 dark:text-[#a0a0a0] hover:text-slate-900 dark:hover:text-[#e8e8e8] hover:bg-white/50 dark:hover:bg-white/5"
                  }`}
                  role="tab"
                  aria-selected={mode === "login"}
                  aria-controls="form-login"
                >
                  <Lock className="w-3.5 h-3.5 sm:hidden" />
                  {t.signIn}
                </button>
                <button
                  onClick={() => setMode("signup")}
                  className={`flex-1 py-3 sm:py-2 px-3 text-sm sm:text-xs font-bold rounded-xl sm:rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                    mode === "signup"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-400/30"
                      : "text-slate-500 dark:text-[#a0a0a0] hover:text-slate-900 dark:hover:text-[#e8e8e8] hover:bg-white/50 dark:hover:bg-white/5"
                  }`}
                  role="tab"
                  aria-selected={mode === "signup"}
                  aria-controls="form-signup"
                >
                  <Sparkles className="w-3.5 h-3.5 sm:hidden" />
                  {t.signUp}
                </button>
              </div>

              {/* Login form */}
              {mode === "login" && (
                <div id="form-login" role="tabpanel" className="space-y-3">
                  <h2 className="text-lg font-black text-slate-900 dark:text-[#e8e8e8] tracking-tight">
                    {t.managerSpace}
                  </h2>
                  <form onSubmit={handleLogin} className="space-y-2.5 mt-2" noValidate>
                    <div>
                      <label
                        htmlFor="login-email"
                        className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1"
                      >
                        {t.email}
                      </label>
                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearErrors();
                        }}
                        placeholder="contact@sejoura.com"
                        className={`w-full px-3.5 py-3 sm:py-2 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs sm:text-xs outline-none focus:border-blue-600 transition-all ${
                          errors.email
                            ? "border-red-400 dark:border-red-500"
                            : "border-slate-200 dark:border-[#404040]"
                        }`}
                      />
                      {errors.email && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="login-password"
                        className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1"
                      >
                        {t.password}
                      </label>
                      <div className="relative">
                        <input
                          id="login-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearErrors();
                          }}
                          placeholder="••••••••"
                          className={`w-full px-3.5 py-3 sm:py-2 pr-10 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs sm:text-xs outline-none focus:border-blue-600 transition-all ${
                            errors.password
                              ? "border-red-400 dark:border-red-500"
                              : "border-slate-200 dark:border-[#404040]"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[#e8e8e8]"
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.password}</p>
                      )}
                    </div>

                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 text-[11px] pt-1 pb-1">
                       <label className="flex items-center text-slate-500 dark:text-[#a0a0a0] cursor-pointer hover:text-slate-700 dark:hover:text-[#e8e8e8] transition-colors">
                         <input
                           type="checkbox"
                           name="remember"
                           checked={remember}
                           onChange={(e) => setRemember(e.target.checked)}
                           className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mr-1.5 w-3.5 h-3.5 sm:w-3 sm:h-3 cursor-pointer"
                         />
                         {t.rememberMe}
                       </label>
                       <Link
                         href="/auth/forgot-password"
                         className="text-blue-500 font-bold hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                       >
                         {t.forgotPassword}
                       </Link>
                     </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 sm:py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all text-xs sm:text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t.signing}
                        </>
                      ) : (
                        t.loginBtn
                      )}
                    </button>
                  </form>

                  {/* Divider */}
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200 dark:border-[#404040]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 bg-white dark:bg-[#1a1a1a] text-slate-400 dark:text-[#8a8a8a] text-[10px] font-medium">
                        {t.or}
                      </span>
                    </div>
                  </div>

                  {/* Google sign-in */}
                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={loading}
                    className="w-full py-3.5 sm:py-2 rounded-xl border border-slate-200 dark:border-[#404040] bg-white dark:bg-[#262626] text-slate-700 dark:text-[#c0c0c0] font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-xs sm:text-xs"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                    )}
                    {t.signInWith}
                  </button>

                  {/* Magic Link button */}
                  {!magicLinkSent ? (
                    <button
                      type="button"
                      onClick={handleMagicLink}
                      disabled={magicLinkLoading}
                      className="w-full py-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-xs"
                    >
                      {magicLinkLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      {magicLinkLoading
                        ? (lang === "fr" ? "Envoi en cours..." : "Sending...")
                        : t.magicLink}
                    </button>
                  ) : (
                    <div className="w-full py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-medium flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {t.magicLinkSent}
                    </div>
                  )}
                </div>
              )}

              {/* Signup form */}
              {mode === "signup" && (
                <div id="form-signup" role="tabpanel" className="space-y-3">
                  <h2 className="text-lg font-black text-slate-900 dark:text-[#e8e8e8] tracking-tight">
                    {t.createAccount}
                  </h2>
                  <form onSubmit={handleSignUp} className="space-y-2 mt-2" noValidate>
                    <p className="text-[11px] text-slate-500 dark:text-[#a0a0a0] [@media(max-height:640px)]:hidden">
                      {lang === "fr"
                        ? "Étape 1 sur 2 — créez votre compte, puis configurez votre établissement."
                        : "Step 1 of 2 — create your account, then set up your establishment."}
                    </p>
                    <div>
                      <label
                        htmlFor="signup-email"
                        className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1"
                      >
                        {t.email}
                      </label>
                      <input
                        id="signup-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearErrors();
                        }}
                        placeholder="contact@sejoura.com"
                        className={`w-full px-3 py-3 sm:py-2 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs sm:text-xs outline-none focus:border-blue-600 transition-all ${
                          errors.email
                            ? "border-red-400 dark:border-red-500"
                            : "border-slate-200 dark:border-[#404040]"
                        }`}
                      />
                      {errors.email && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="signup-password"
                        className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1"
                      >
                        {t.password}
                      </label>
                      <div className="relative">
                        <input
                          id="signup-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearErrors();
                          }}
                          placeholder="••••••••"
                          className={`w-full px-3 py-3 sm:py-2 pr-10 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs sm:text-xs outline-none focus:border-blue-600 transition-all ${
                            errors.password
                              ? "border-red-400 dark:border-red-500"
                              : "border-slate-200 dark:border-[#404040]"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[#e8e8e8]"
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.password}</p>
                      )}
                      <PasswordStrength password={password} />
                    </div>
                    <div>
                      <label
                        htmlFor="signup-confirm"
                        className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1"
                      >
                        {t.confirmPassword}
                      </label>
                      <input
                        id="signup-confirm"
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          clearErrors();
                        }}
                        placeholder="••••••••"
                        className={`w-full px-3 py-3 sm:py-2 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs sm:text-xs outline-none focus:border-blue-600 transition-all ${
                          errors.confirmPassword
                            ? "border-red-400 dark:border-red-500"
                            : "border-slate-200 dark:border-[#404040]"
                        }`}
                      />
                      {errors.confirmPassword && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          {errors.confirmPassword}
                        </p>
                      )}
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer group pt-1">
                      <input
                        id="terms"
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 dark:border-[#505050] text-blue-600 focus:ring-blue-500 bg-white dark:bg-[#262626]"
                      />
                      <span className="text-[11px] text-slate-600 dark:text-[#a0a0a0] group-hover:text-slate-900 dark:group-hover:text-[#e8e8e8] transition-colors">
                        {t.acceptTerms}{" "}
                        <Link href="/cgu" className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
                          {t.terms}
                        </Link>
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-1 py-3.5 sm:py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all text-xs sm:text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t.creating}
                        </>
                      ) : (
                        t.signUpBtn
                      )}
                    </button>
                    <p className="text-center text-[10px] text-slate-500 dark:text-[#a0a0a0] font-medium">
                      {t.noCardRequired}
                    </p>
                  </form>

                  {/* Divider + Google sign-up, masqués sur écrans courts pour éviter le scroll */}
                  <div className="[@media(max-height:760px)]:hidden">
                    <div className="relative my-3">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200 dark:border-[#404040]" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="px-3 bg-white dark:bg-[#1a1a1a] text-slate-400 dark:text-[#8a8a8a] text-[10px] font-medium">
                          {t.or}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleAuth}
                      disabled={loading}
                      className="w-full py-3.5 sm:py-2 rounded-xl border border-slate-200 dark:border-[#404040] bg-white dark:bg-[#262626] text-slate-700 dark:text-[#c0c0c0] font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-xs sm:text-xs"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                      )}
                      {t.signUpWith}
                    </button>

                    {/* Magic Link button - desktop signup */}
                    {!magicLinkSent ? (
                      <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={magicLinkLoading}
                        className="w-full py-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-xs"
                      >
                        {magicLinkLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        {magicLinkLoading
                          ? (lang === "fr" ? "Envoi en cours..." : "Sending...")
                          : t.magicLink}
                      </button>
                    ) : (
                      <div className="w-full py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-medium flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {t.magicLinkSent}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#333333] text-center">
              <p className="text-[10px] text-slate-500 dark:text-[#a0a0a0] font-bold">
                <Lock className="w-3 h-3 text-slate-300 dark:text-[#666666] inline mr-1" />
                {t.privateInfo}
              </p>
            </div>
          </div>

          {/* Mobile CTA buttons — below carousel on mobile only */}
          <div className="md:hidden w-full flex flex-col items-center gap-2 mt-1">
            <button
              onClick={() => { setMode("login"); setAuthModalMode("login"); }}
              className="w-full max-w-xs py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/30 text-sm transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              {t.signIn}
            </button>
            <button
              onClick={() => { setMode("signup"); setAuthModalMode("signup"); }}
              className="w-full max-w-xs py-2.5 px-6 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/25 shadow-lg backdrop-blur-md text-sm transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {t.signUp}
            </button>
            <p className="text-[10px] text-white/50 font-medium">{t.noCardRequired}</p>
          </div>
        </div>
      </main>

      {/* Mobile auth modal */}
      {authModalMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setAuthModalMode(null)}
        >
          <div
            className="bg-white dark:bg-[#1a1a1a] w-full sm:max-w-[400px] sm:rounded-3xl rounded-t-3xl shadow-2xl border border-slate-200 dark:border-[#333333] max-h-[92vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div />
                <button
                  onClick={() => setAuthModalMode(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#2e2e2e] transition-colors"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex bg-slate-100 dark:bg-[#262626] p-1.5 rounded-2xl mb-5 border border-slate-200 dark:border-[#333333]" role="tablist">
                <button onClick={() => setAuthModalMode("login")} className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${authModalMode === "login" ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-400/30" : "text-slate-500 dark:text-[#a0a0a0]"}`} role="tab" aria-selected={authModalMode === "login"}>
                  <Lock className="w-3.5 h-3.5" />{t.signIn}
                </button>
                <button onClick={() => setAuthModalMode("signup")} className={`flex-1 py-3 px-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${authModalMode === "signup" ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-400/30" : "text-slate-500 dark:text-[#a0a0a0]"}`} role="tab" aria-selected={authModalMode === "signup"}>
                  <Sparkles className="w-3.5 h-3.5" />{t.signUp}
                </button>
              </div>
              {authModalMode === "login" && (
                <div className="space-y-3">
                  <h2 className="text-lg font-black text-slate-900 dark:text-[#e8e8e8] tracking-tight">{t.managerSpace}</h2>
                  <form onSubmit={handleLogin} className="space-y-2.5 mt-2" noValidate>
                    <div>
                      <label htmlFor="m-login-email" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1">{t.email}</label>
                      <input id="m-login-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); clearErrors(); }} placeholder="contact@sejoura.com" className={`w-full px-3.5 py-3 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs outline-none focus:border-blue-600 transition-all ${errors.email ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-[#404040]"}`} />
                      {errors.email && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>}
                    </div>
                    <div>
                      <label htmlFor="m-login-password" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1">{t.password}</label>
                      <div className="relative">
                        <input id="m-login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} value={password} onChange={(e) => { setPassword(e.target.value); clearErrors(); }} placeholder="••••••••" className={`w-full px-3.5 py-3 pr-10 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs outline-none focus:border-blue-600 transition-all ${errors.password ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-[#404040]"}`} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[#e8e8e8]" aria-label="Afficher">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.password}</p>}
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 pb-1">
                      <label className="flex items-center text-slate-500 dark:text-[#a0a0a0] cursor-pointer">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mr-1.5 w-3.5 h-3.5 cursor-pointer" />
                        {t.rememberMe}
                      </label>
                      <Link href="/auth/forgot-password" className="text-blue-500 font-bold hover:text-blue-700 dark:hover:text-blue-300 transition-colors">{t.forgotPassword}</Link>
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />{t.signing}</>) : t.loginBtn}
                    </button>
                  </form>
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-[#404040]" /></div>
                    <div className="relative flex justify-center"><span className="px-3 bg-white dark:bg-[#1a1a1a] text-slate-400 dark:text-[#8a8a8a] text-[10px] font-medium">{t.or}</span></div>
                  </div>
                  <button type="button" onClick={handleGoogleAuth} disabled={loading} className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-[#404040] bg-white dark:bg-[#262626] text-slate-700 dark:text-[#c0c0c0] font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-xs">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (<svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>)}
                    {t.signInWith}
                  </button>

                  {/* Magic Link button - mobile login */}
                  {!magicLinkSent ? (
                    <button
                      type="button"
                      onClick={handleMagicLink}
                      disabled={magicLinkLoading}
                      className="w-full py-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-xs"
                    >
                      {magicLinkLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      {magicLinkLoading
                        ? (lang === "fr" ? "Envoi en cours..." : "Sending...")
                        : t.magicLink}
                    </button>
                  ) : (
                    <div className="w-full py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-medium flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {t.magicLinkSent}
                    </div>
                  )}
                </div>
              )}
              {authModalMode === "signup" && (
                <div className="space-y-3">
                  <h2 className="text-lg font-black text-slate-900 dark:text-[#e8e8e8] tracking-tight">{t.createAccount}</h2>
                  <form onSubmit={handleSignUp} className="space-y-2 mt-2" noValidate>
                    <p className="text-[11px] text-slate-500 dark:text-[#a0a0a0]">
                      {lang === "fr" ? "Étape 1 sur 2 — créez votre compte, puis configurez votre établissement." : "Step 1 of 2 — create your account, then set up your establishment."}
                    </p>
                    <div>
                      <label htmlFor="m-signup-email" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1">{t.email}</label>
                      <input id="m-signup-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); clearErrors(); }} placeholder="contact@sejoura.com" className={`w-full px-3.5 py-3 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs outline-none focus:border-blue-600 transition-all ${errors.email ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-[#404040]"}`} />
                      {errors.email && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>}
                    </div>
                    <div>
                      <label htmlFor="m-signup-password" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1">{t.password}</label>
                      <div className="relative">
                        <input id="m-signup-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} value={password} onChange={(e) => { setPassword(e.target.value); clearErrors(); }} placeholder="••••••••" className={`w-full px-3.5 py-3 pr-10 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs outline-none focus:border-blue-600 transition-all ${errors.password ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-[#404040]"}`} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[#e8e8e8]" aria-label="Afficher">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.password}</p>}
                      <PasswordStrength password={password} />
                    </div>
                    <div>
                      <label htmlFor="m-signup-confirm" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#a0a0a0] mb-1">{t.confirmPassword}</label>
                      <input id="m-signup-confirm" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); clearErrors(); }} placeholder="••••••••" className={`w-full px-3.5 py-3 rounded-xl border bg-slate-50 dark:bg-[#262626] text-slate-800 dark:text-[#e8e8e8] text-xs outline-none focus:border-blue-600 transition-all ${errors.confirmPassword ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-[#404040]"}`} />
                      {errors.confirmPassword && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errors.confirmPassword}</p>}
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer group pt-1">
                      <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 dark:border-[#505050] text-blue-600 focus:ring-blue-500 bg-white dark:bg-[#262626]" />
                      <span className="text-[11px] text-slate-600 dark:text-[#a0a0a0]">
                        {t.acceptTerms}{" "}<Link href="/cgu" className="text-blue-600 dark:text-blue-400 underline underline-offset-2">{t.terms}</Link>
                      </span>
                    </label>
                    <button type="submit" disabled={loading} className="w-full mt-1 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />{t.creating}</>) : t.signUpBtn}
                    </button>
                    <p className="text-center text-[10px] text-slate-500 dark:text-[#a0a0a0] font-medium">{t.noCardRequired}</p>
                  </form>
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-[#404040]" /></div>
                    <div className="relative flex justify-center"><span className="px-3 bg-white dark:bg-[#1a1a1a] text-slate-400 dark:text-[#8a8a8a] text-[10px] font-medium">{t.or}</span></div>
                  </div>
                  <button type="button" onClick={handleGoogleAuth} disabled={loading} className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-[#404040] bg-white dark:bg-[#262626] text-slate-700 dark:text-[#c0c0c0] font-medium shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-xs">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (<svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>)}
                    {t.signUpWith}
                  </button>

                  {/* Magic Link button for signup */}
                  {!magicLinkSent ? (
                    <button
                      type="button"
                      onClick={handleMagicLink}
                      disabled={magicLinkLoading}
                      className="w-full py-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-xs"
                    >
                      {magicLinkLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      {magicLinkLoading
                        ? (lang === "fr" ? "Envoi en cours..." : "Sending...")
                        : t.magicLink}
                    </button>
                  ) : (
                    <div className="w-full py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-medium flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {t.magicLinkSent}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#333333] text-center">
                <p className="text-[10px] text-slate-500 dark:text-[#a0a0a0] font-bold">
                  <Lock className="w-3 h-3 text-slate-300 dark:text-[#666666] inline mr-1" />{t.privateInfo}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-20 w-full flex flex-col items-center justify-center py-2 text-xs text-white/60 space-y-1 px-4">
        <div className="flex items-center gap-1.5">
          <span>{t.footerPowered}</span>
          <a
            href="https://refontiq.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white/90 hover:text-white transition-colors underline underline-offset-2 decoration-white/30 hover:decoration-white/60"
          >
            Refontiq
          </a>
        </div>
        <p className="text-white/40">{t.footerRights} {t.footerContact}</p>
      </footer>

      {/* Modal */}
      {activeSection && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActiveSection(null)}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#404040] text-slate-800 dark:text-[#e8e8e8] w-full max-w-3xl rounded-3xl p-6 sm:p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={modalCloseRef}
              onClick={() => setActiveSection(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 dark:hover:text-[#ffffff] p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2e2e2e] transition-colors"
              aria-label="Fermer la modale"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 id="modal-title" className="text-2xl font-black text-slate-900 dark:text-[#e8e8e8] mb-4 pr-8">
              {activeSection} — Séjoura
            </h3>
            <div className="text-slate-600 dark:text-[#c0c0c0] text-sm space-y-3 leading-relaxed">
              {modalContent[activeSection]}
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 dark:border-[#333333] flex justify-end">
              <button
                onClick={() => setActiveSection(null)}
                className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition-colors shadow-md"
              >
                {t.closeModal}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}