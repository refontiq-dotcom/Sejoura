"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/components/providers/theme-provider";
import { PasswordStrength } from "@/components/auth/password-strength";
import { lockBodyScroll } from "@/components/ui/modal";
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
    // Trust / Social proof
    trustTitle: "Ils nous font confiance",
    trustStat: "50+ établissements",
    trustStatDesc: "hôtels & résidences en Côte d'Ivoire",
    testimonial1Quote:
      "Séjoura a transformé notre gestion. Le ménage est automatique, la caisse est claire, et les réservations arrivent sans effort.",
    testimonial1Name: "M. Kouassi",
    testimonial1Role: "Gérant, Hôtel Riviera Abidjan",
    testimonial2Quote:
      "Avant c'était le chaos. Maintenant je vois en 2 secondes qui arrive, qui part, et combien on a encaissé aujourd'hui.",
    testimonial2Name: "Mme Aya",
    testimonial2Role: "Directrice, Résidence Palm Beach",
    // Footer
    footerRights: "© 2026 Séjoura by Refontiq.",
    footerContact: "Abidjan, Côte d'Ivoire",
    footerPowered: "Une solution",
    // Modal
    closeModal: "Fermer & Revenir au portail",
    // Validation
    emailInvalid: "Adresse e-mail invalide.",
    passwordShort: "Le mot de passe doit comporter au moins 6 caractères.",
    passwordMismatch: "Les mots de passe ne correspondent pas 🔐",
    termsError: "Vous devez accepter les conditions d'utilisation.",
    verifyEmail: "Compte créé ! Vérifiez votre e-mail pour activer votre compte.",
    loginError: "Adresse e-mail ou mot de passe incorrect.",
    signupError: "Oups, l'action a échoué : inscription.",
    generalError: "Oups, un petit souci technique ! Réessayez 🤕 Veuillez réessayer.",
    loginSuccess: "Connexion réussie !",
    signupSuccess: "Compte créé avec succès !",
    signing: "Connexion en cours...",
    creating: "Création du compte...",
    or: "ou",
    signInWith: "Se connecter avec Google",
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
    // Trust / Social proof
    trustTitle: "They trust us",
    trustStat: "50+ establishments",
    trustStatDesc: "hotels & residences in Ivory Coast",
    testimonial1Quote:
      "Séjoura transformed our management. Cleaning is automatic, cash is clear, and bookings arrive without effort.",
    testimonial1Name: "Mr. Kouassi",
    testimonial1Role: "Manager, Hôtel Riviera Abidjan",
    testimonial2Quote:
      "Before it was chaos. Now I see in 2 seconds who arrives, who leaves, and how much we collected today.",
    testimonial2Name: "Mrs. Aya",
    testimonial2Role: "Director, Résidence Palm Beach",
    // Footer
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
  const searchParams = useSearchParams();

  // After Google OAuth signup, open the auth modal in signup mode
  useEffect(() => {
    if (searchParams.get("google_signup") === "true") {
      setMode("signup");
      setAuthModalMode("signup");
      // Clean the URL param
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);
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
  // (verrou comptabilisé partagé : ne libère le scroll que lorsque le dernier
  // overlay se ferme, et compose avec les <Modal> du reste de l'app)
  useEffect(() => {
    if (!(activeSection || mobileMenuOpen || authModalMode)) return;
    return lockBodyScroll();
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

  async function handleGoogleAuth(isSignup = false) {
    setLoading(true);
    try {
      const supabase = createClient();
      // Use redirect flow (not popup) — works in PWA and on mobile
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard${isSignup ? "&google_signup=true" : ""}`,
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Essentiel */}
          <div className="bg-slate-50 dark:bg-[#262626]/60 p-6 rounded-2xl border border-slate-200 dark:border-[#404040]">
            <h5 className="font-black text-slate-900 dark:text-[#e8e8e8] text-xl">
              {lang === "fr" ? "Essentiel" : "Essentiel"}
            </h5>
            <p className="text-slate-500 dark:text-[#a0a0a0] text-xs mb-4">
              {lang === "fr" ? "1 établissement maximum" : "Up to 1 establishment"}
            </p>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mb-4">
              9 900 F <span className="text-xs font-semibold text-slate-500">/mois</span>
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
                {lang === "fr" ? "Zéro frais d'installation" : "Zero setup fee"}
              </li>
            </ul>
          </div>
          {/* Croissance */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border-2 border-emerald-500 shadow-lg shadow-emerald-100 dark:shadow-emerald-900/20 relative">
            <span className="absolute -top-3 left-6 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {lang === "fr" ? "Le plus choisi" : "Most chosen"}
            </span>
            <h5 className="font-black text-slate-900 dark:text-[#e8e8e8] text-xl mt-1">
              {lang === "fr" ? "Croissance" : "Growth"}
            </h5>
            <p className="text-slate-500 dark:text-[#a0a0a0] text-xs mb-4">
              {lang === "fr" ? "Jusqu'à 35 unités & module ménage" : "Up to 35 units & cleaning module"}
            </p>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mb-4">
              24 900 F <span className="text-xs font-semibold text-slate-500">/mois</span>
            </div>
            <ul className="text-sm space-y-3 text-slate-700 dark:text-[#c0c0c0]">
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "35 unités & 5 comptes système" : "35 units & 5 system accounts"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Module ménage complet (pool, timers)" : "Full cleaning module (pool, timers)"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Comptabilité (factures + export mensuel)" : "Accounting (invoices + monthly export)"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Portail client en consultation" : "Read-only client portal"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Module RH (dossiers employés, contrats)" : "HR module (employee records, contracts)"}
              </li>
            </ul>
          </div>
          {/* Entreprise */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border-2 border-blue-500 shadow-lg shadow-blue-100 dark:shadow-blue-900/20 relative">
            <h5 className="font-black text-slate-900 dark:text-[#e8e8e8] text-xl">
              Entreprise
            </h5>
            <p className="text-slate-500 dark:text-[#a0a0a0] text-xs mb-4">
              {lang === "fr" ? "Établissements illimités & API" : "Unlimited establishments & API"}
            </p>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mb-4">
              54 900 F <span className="text-xs font-semibold text-slate-500">/mois</span>
            </div>
            <ul className="text-sm space-y-3 text-slate-700 dark:text-[#c0c0c0]">
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Établissements & utilisateurs illimités" : "Unlimited establishments & users"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Comptabilité complète & bénéfice net" : "Full accounting & net profit"}
              </li>
              <li className="flex items-start">
                <Check className="w-4 h-4 text-blue-600 mt-0.5 mr-2 shrink-0" />
                {lang === "fr" ? "Portail client complet & profil intelligent" : "Full client portal & smart profile"}
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
        <p className="text-xs text-slate-500 dark:text-[#a0a0a0] text-center pt-2">
          {lang === "fr"
            ? "2 mois offerts sur l'engagement annuel, tous plans confondus."
            : "2 months free on annual commitment, all plans."}
        </p>
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
                  ? "1 mois offert dès l'inscription, sans carte bancaire et sans engagement. À la fin de l'essai, vous choisissez l'offre Essentiel (9 900 FCFA/mois), Croissance (24 900 FCFA/mois) ou Entreprise (54 900 FCFA/mois)."
                  : "1 month free at signup, no credit card and no commitment. At the end of the trial, you choose Essentiel (9,900 XOF/month), Croissance (24,900 XOF/month) or Entreprise (54,900 XOF/month).",
            },
            {
              q: lang === "fr" ? "Différence entre les offres ?" : "Difference between the plans?",
              a:
                lang === "fr"
                  ? "Le plan Essentiel (9 900 FCFA/mois) convient jusqu'à 1 établissement avec 1 admin et 1 réceptionniste. Le plan Croissance (24 900 FCFA/mois) ajoute le module ménage complet, la comptabilité et jusqu'à 35 unités. Le plan Entreprise (54 900 FCFA/mois) ajoute les établissements illimités, la comptabilité complète, le portail client complet, l'accès API et un support dédié 24/7."
                  : "The Essentiel plan (9,900 XOF/month) suits up to 1 establishment with 1 admin and 1 receptionist. The Croissance plan (24,900 XOF/month) adds the full cleaning module, accounting and up to 35 units. The Entreprise plan (54,900 XOF/month) adds unlimited establishments, full accounting, the full client portal, API access and dedicated 24/7 support.",
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

  return (
    <div className="font-sans antialiased bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300">
      
      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-18">
            <button type="button" onClick={handleLogoClick} className="flex items-center gap-2.5 group bg-transparent border-none cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/25 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight">Séjoura</span>
            </button>

            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
              <a href="#features" className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors">{t.navFeatures || "Fonctionnalités"}</a>
              <a href="#pricing" className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors">{t.navPricing || "Tarifs"}</a>
              <a href="#testimonials" className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors">Témoignages</a>
              <button onClick={() => { setMode("login"); setAuthModalMode("login"); }} className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors bg-transparent border-none cursor-pointer">
                Démo Dashboard
              </button>
            </nav>

            <div className="flex items-center gap-3">
              <button onClick={toggleTheme} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-slate-800 transition-colors" aria-label="Changer de thème">
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button onClick={() => { setMode("login"); setAuthModalMode("login"); }} className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-600 transition-colors bg-transparent border-none cursor-pointer">
                {t.signIn || "Connexion"}
              </button>
              <button onClick={() => { setMode("signup"); setAuthModalMode("signup"); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-lg shadow-brand-600/25 hover:shadow-brand-600/40 transition-all border-none cursor-pointer">
                {t.signUp || "Essayer gratuitement"}
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-400/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 text-xs font-semibold mb-6 border border-brand-200/60 dark:border-brand-800">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
                SOLUTION TOUT-EN-UN • Côte d'Ivoire & Afrique de l'Ouest
              </div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold leading-[1.1] tracking-tight text-slate-900 dark:text-white mb-6">
                La gestion simple de vos
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-400"> résidences & hôtels</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                Une seule plateforme pour suivre réservations, ménage, caisse et équipes. 
                Zéro frais d'installation. 1 mois offert. Paiements Wave intégrés.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => { setMode("signup"); setAuthModalMode("signup"); }} className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-xl shadow-brand-600/30 hover:shadow-brand-600/50 transition-all text-base border-none cursor-pointer">
                  Démarrer gratuitement
                  <Sparkles className="w-5 h-5" />
                </button>
                <a href="#features" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200 transition-all">
                  Voir les fonctionnalités
                </a>
              </div>
              <div className="mt-10 flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full bg-brand-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">MK</div>
                  <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">AY</div>
                  <div className="w-8 h-8 rounded-full bg-violet-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">JD</div>
                </div>
                <p><strong className="text-slate-800 dark:text-slate-200">50+</strong> établissements déjà équipés</p>
              </div>
            </div>

            <div className="relative hidden md:block">
              <div className="absolute -inset-4 bg-gradient-to-r from-brand-500/20 to-accent-500/20 rounded-3xl blur-2xl"></div>
              <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                  </div>
                  <div className="flex-1 mx-4 h-6 rounded-md bg-slate-200/70 dark:bg-slate-700/70 flex items-center px-3 text-xs text-slate-500">app.sejoura.com/dashboard</div>
                </div>
                <div className="p-5 grid grid-cols-3 gap-3">
                  <div className="col-span-3 flex items-center justify-between mb-1">
                    <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700"></div>
                    <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-900"></div>
                  </div>
                  <div className="rounded-xl bg-brand-50 dark:bg-brand-950/40 p-3 border border-brand-100 dark:border-brand-900">
                    <div className="text-[10px] text-brand-600 dark:text-brand-400 font-medium mb-1">Occupancy</div>
                    <div className="text-xl font-bold text-brand-700 dark:text-brand-300">87%</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-3 border border-emerald-100 dark:border-emerald-900">
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">Recettes</div>
                    <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">2.4M</div>
                  </div>
                  <div className="rounded-xl bg-violet-50 dark:bg-violet-950/40 p-3 border border-violet-100 dark:border-violet-900">
                    <div className="text-[10px] text-violet-600 dark:text-violet-400 font-medium mb-1">Arrivées</div>
                    <div className="text-xl font-bold text-violet-700 dark:text-violet-300">12</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-10 border-y border-slate-100 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="w-9 h-9 rounded-full bg-brand-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">MK</div>
                <div className="w-9 h-9 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">AY</div>
                <div className="w-9 h-9 rounded-full bg-violet-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">JD</div>
                <div className="w-9 h-9 rounded-full bg-amber-500 border-2 border-white dark:border-slate-950 flex items-center justify-center text-white text-xs font-bold">+</div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-200"><strong className="text-brand-600 dark:text-brand-400">50+</strong> établissements</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">hôtels & résidences en Côte d'Ivoire</p>
              </div>
            </div>
            <div className="hidden md:block w-px h-8 bg-slate-200 dark:bg-slate-700" />
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 opacity-70 grayscale hover:grayscale-0 transition-all">
              <span className="font-display font-bold text-base text-slate-700 dark:text-slate-300">Hôtel Riviera</span>
              <span className="font-display font-bold text-base text-slate-700 dark:text-slate-300">Résidence Palm Beach</span>
              <span className="font-display font-bold text-base text-slate-700 dark:text-slate-300">Cocody Suites</span>
              <span className="font-display font-bold text-base text-slate-700 dark:text-slate-300">Abidjan Lodge</span>
              <span className="font-display font-bold text-base text-slate-700 dark:text-slate-300">Yamoussoukro Inn</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4">Tout ce dont vous avez besoin</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg">De la réservation au check-out, en passant par le ménage et la caisse — une seule interface claire.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="group p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xl hover:shadow-brand-500/5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6 text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Réservations intelligentes</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">Check-in / check-out, prolongations, no-show, factures détaillées avec historique des nuits.</p>
            </div>

            <div className="group p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xl hover:shadow-brand-500/5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Ménage automatisé</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">Kanban clair, assignation d'équipes, statuts en temps réel. Plus de chambres sales oubliées.</p>
            </div>

            <div className="group p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xl hover:shadow-brand-500/5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Wallet className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Caisse & Comptabilité</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">Suivi des encaissements, factures PDF, export. Visibilité jour après jour sur vos recettes.</p>
            </div>

            <div className="group p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xl hover:shadow-brand-500/5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Gestion d'équipes</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">Rôles (gérant, réceptionniste, ménage), activation/désactivation, permissions fines.</p>
            </div>

            <div className="group p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xl hover:shadow-brand-500/5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Building2 className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Multi-établissements</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">Gérez plusieurs résidences depuis un seul compte. Limites selon votre forfait.</p>
            </div>

            <div className="group p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xl hover:shadow-brand-500/5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Store className="w-6 h-6 text-sky-600 dark:text-sky-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Paiements Wave</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">Abonnements et encaissements via Wave. Flux semi-automatisé adapté au marché local.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 lg:py-28 bg-slate-50 dark:bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4">Tarifs simples et transparents</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg">1 mois offert. Sans carte bancaire. Annulation à tout moment.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            <div className="relative p-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-shadow">
              <h3 className="font-display font-bold text-lg mb-1">Essentiel</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Pour démarrer</p>
              <div className="mb-6">
                <span className="font-display text-4xl font-extrabold">9 900</span>
                <span className="text-slate-500 text-sm"> FCFA / mois</span>
              </div>
              <ul className="space-y-3 text-sm mb-8">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> 1 établissement</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Jusqu'à 20 chambres</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Réservations & ménage</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Support email</li>
              </ul>
              <button onClick={() => { setMode("signup"); setAuthModalMode("signup"); }} className="block w-full text-center py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent">Commencer</button>
            </div>

            <div className="relative p-7 rounded-2xl bg-white dark:bg-slate-900 border-2 border-brand-500 shadow-xl shadow-brand-500/10 scale-[1.02]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-brand-600 text-white text-xs font-bold">Populaire</div>
              <h3 className="font-display font-bold text-lg mb-1">Croissance</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Le plus choisi</p>
              <div className="mb-6">
                <span className="font-display text-4xl font-extrabold">24 900</span>
                <span className="text-slate-500 text-sm"> FCFA / mois</span>
              </div>
              <ul className="space-y-3 text-sm mb-8">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> 3 établissements</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Chambres illimitées</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Comptabilité + exports</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Multi-utilisateurs</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Support prioritaire</li>
              </ul>
              <button onClick={() => { setMode("signup"); setAuthModalMode("signup"); }} className="block w-full text-center py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-lg shadow-brand-600/25 transition-colors border-none cursor-pointer">Commencer</button>
            </div>

            <div className="relative p-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-shadow">
              <h3 className="font-display font-bold text-lg mb-1">Entreprise</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Pour les groupes</p>
              <div className="mb-6">
                <span className="font-display text-4xl font-extrabold">54 900</span>
                <span className="text-slate-500 text-sm"> FCFA / mois</span>
              </div>
              <ul className="space-y-3 text-sm mb-8">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Établissements illimités</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Toutes les fonctionnalités</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> API & intégrations</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Account manager dédié</li>
              </ul>
              <a href="https://wa.me/2250100372900" target="_blank" className="block w-full text-center py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Nous contacter</a>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4">Ils en parlent mieux que nous</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
            <blockquote className="p-7 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <div className="flex gap-1 mb-4 text-amber-400">
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <p className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">« Séjoura a transformé notre gestion. Le ménage est automatique, la caisse est claire, et les réservations arrivent sans effort. »</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">MK</div>
                <div>
                  <div className="font-semibold text-sm">M. Kouassi</div>
                  <div className="text-xs text-slate-500">Gérant, Hôtel Riviera Abidjan</div>
                </div>
              </div>
            </blockquote>

            <blockquote className="p-7 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
              <div className="flex gap-1 mb-4 text-amber-400">
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
              <p className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">« Avant c'était le chaos. Maintenant je vois en 2 secondes qui arrive, qui part, et combien on a encaissé aujourd'hui. »</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">AY</div>
                <div>
                  <div className="font-semibold text-sm">Mme Aya</div>
                  <div className="text-xs text-slate-500">Directrice, Résidence Palm Beach</div>
                </div>
              </div>
            </blockquote>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-10 lg:p-14 text-center text-white shadow-2xl shadow-brand-600/30">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4 relative">Prêt à simplifier votre gestion ?</h2>
            <p className="text-brand-100 text-lg mb-8 max-w-xl mx-auto relative">Rejoignez les 50+ établissements qui utilisent déjà Séjoura. 1 mois offert, sans engagement.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center relative">
              <button onClick={() => { setMode("signup"); setAuthModalMode("signup"); }} className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-brand-700 font-bold shadow-lg hover:bg-brand-50 transition-colors cursor-pointer border-none">
                Essayer la démo
                <Check className="w-5 h-5" />
              </button>
              <a href="https://wa.me/2250100372900" target="_blank" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-white/30 hover:bg-white/10 font-semibold transition-colors">
                <MessageCircle className="w-5 h-5" />
                Contacter sur WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-display font-bold text-lg">Séjoura</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">© 2026 Refontiq. Tous droits réservés.</p>
            <div className="flex items-center gap-4 text-sm">
              <a href="https://refontiq.com" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-300 hover:text-brand-600 transition-colors">By Refontiq</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {authModalMode && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setAuthModalMode(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAuthModalMode(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors z-10 border-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 mb-4 shadow-lg shadow-brand-500/25">
                  {mode === "login" ? <DoorOpen className="w-6 h-6 text-white" /> : <Sparkles className="w-6 h-6 text-white" />}
                </div>
                <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                  {mode === "login" ? "Bon retour" : "Créer un compte"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {mode === "login"
                    ? "Connectez-vous pour accéder à votre espace."
                    : "Rejoignez Séjoura, sans carte bancaire."}
                </p>
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-5">
                <button
                  onClick={() => setMode("login")}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all border-0 cursor-pointer ${mode === "login" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 bg-transparent hover:text-slate-700 dark:text-slate-400"}`}
                >
                  {t.signIn}
                </button>
                <button
                  onClick={() => setMode("signup")}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all border-0 cursor-pointer ${mode === "signup" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 bg-transparent hover:text-slate-700 dark:text-slate-400"}`}
                >
                  {t.signUp}
                </button>
              </div>

              {mode === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="m-login-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.email}</label>
                    <input
                      id="m-login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                      placeholder="contact@sejoura.com"
                      className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 outline-none transition-all ${errors.email ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`}
                    />
                    {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
                  </div>
                  <div>
                    <label htmlFor="m-login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.password}</label>
                    <div className="relative">
                      <input
                        id="m-login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                        placeholder="••••••••"
                        className={`w-full px-4 py-2.5 pr-10 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 outline-none transition-all ${errors.password ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-slate-600 dark:text-slate-400">{t.rememberMe}</span>
                    </label>
                    <Link href="/auth/forgot-password" className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium">{t.forgotPassword}</Link>
                  </div>
                  <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all border-0 cursor-pointer">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                    {loading ? t.signing : t.loginBtn}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="m-signup-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.email}</label>
                    <input
                      id="m-signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                      placeholder="contact@sejoura.com"
                      className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 outline-none transition-all ${errors.email ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`}
                    />
                    {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
                  </div>
                  <div>
                    <label htmlFor="m-signup-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.password}</label>
                    <div className="relative">
                      <input
                        id="m-signup-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                        placeholder="••••••••"
                        className={`w-full px-4 py-2.5 pr-10 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 outline-none transition-all ${errors.password ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
                    <PasswordStrength password={password} />
                  </div>
                  <div>
                    <label htmlFor="m-signup-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t.confirmPassword}</label>
                    <input
                      id="m-signup-confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); clearErrors(); }}
                      placeholder="••••••••"
                      className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 outline-none transition-all ${errors.confirmPassword ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`}
                    />
                    {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <span className="text-slate-600 dark:text-slate-400">
                      {t.acceptTerms}{" "}<Link href="/cgu" className="text-brand-600 hover:underline">{t.terms}</Link>
                    </span>
                  </label>
                  <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all border-0 cursor-pointer">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {loading ? t.creating : t.signUpBtn}
                  </button>
                  <p className="text-center text-xs text-slate-500">{t.noCardRequired}</p>
                </form>
              )}

              <div className="mt-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-700" /></div>
                  <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-slate-900 text-slate-500">{t.or}</span></div>
                </div>
                <button
                  type="button"
                  onClick={() => handleGoogleAuth(mode === "signup")}
                  disabled={loading}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium disabled:opacity-70 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  )}
                  {mode === "login" ? t.signInWith : t.signUpWith}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 font-bold">
                  <Lock className="w-3 h-3 text-slate-300 inline mr-1" />{t.privateInfo}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

