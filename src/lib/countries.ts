export interface CountryConfig {
  code: string;           // ISO 2 (ex: CI, SN, CM, NG, GH, KE, MA, etc.)
  name: string;           // Libellé pays
  phoneCode: string;      // Indicatif (ex: +225, +234, +254)
  currency: string;       // Code ISO devise (ex: XOF, NGN, KES, MAD)
  currencySymbol: string; // Symbole d'affichage (ex: FCFA, ₦, KSh, DH)
  flag: string;           // Emoji drapeau
  defaultLang: "fr" | "en";
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  // --- AFRIQUE DE L'OUEST (UEMOA & ZAO) ---
  { code: "CI", name: "Côte d'Ivoire", phoneCode: "+225", currency: "XOF", currencySymbol: "FCFA", flag: "🇨🇮", defaultLang: "fr" },
  { code: "SN", name: "Sénégal", phoneCode: "+221", currency: "XOF", currencySymbol: "FCFA", flag: "🇸🇳", defaultLang: "fr" },
  { code: "BJ", name: "Bénin", phoneCode: "+229", currency: "XOF", currencySymbol: "FCFA", flag: "🇧🇯", defaultLang: "fr" },
  { code: "BF", name: "Burkina Faso", phoneCode: "+226", currency: "XOF", currencySymbol: "FCFA", flag: "🇧🇫", defaultLang: "fr" },
  { code: "TG", name: "Togo", phoneCode: "+228", currency: "XOF", currencySymbol: "FCFA", flag: "🇹🇬", defaultLang: "fr" },
  { code: "ML", name: "Mali", phoneCode: "+223", currency: "XOF", currencySymbol: "FCFA", flag: "🇲🇱", defaultLang: "fr" },
  { code: "NE", name: "Niger", phoneCode: "+227", currency: "XOF", currencySymbol: "FCFA", flag: "🇳🇪", defaultLang: "fr" },
  { code: "GN", name: "Guinée", phoneCode: "+224", currency: "GNF", currencySymbol: "FG", flag: "🇬🇳", defaultLang: "fr" },
  { code: "NG", name: "Nigeria", phoneCode: "+234", currency: "NGN", currencySymbol: "₦", flag: "🇳🇬", defaultLang: "en" },
  { code: "GH", name: "Ghana", phoneCode: "+233", currency: "GHS", currencySymbol: "₵", flag: "🇬🇭", defaultLang: "en" },

  // --- AFRIQUE CENTRALE (CEMAC) ---
  { code: "CM", name: "Cameroun", phoneCode: "+237", currency: "XAF", currencySymbol: "FCFA", flag: "🇨🇲", defaultLang: "fr" },
  { code: "GA", name: "Gabon", phoneCode: "+241", currency: "XAF", currencySymbol: "FCFA", flag: "🇬🇦", defaultLang: "fr" },
  { code: "CG", name: "Congo (Brazzaville)", phoneCode: "+242", currency: "XAF", currencySymbol: "FCFA", flag: "🇨🇬", defaultLang: "fr" },
  { code: "CD", name: "RDC (Kinshasa)", phoneCode: "+243", currency: "CDF", currencySymbol: "FC", flag: "🇨🇩", defaultLang: "fr" },
  { code: "TD", name: "Tchad", phoneCode: "+235", currency: "XAF", currencySymbol: "FCFA", flag: "🇹🇩", defaultLang: "fr" },
  { code: "CF", name: "Centrafrique", phoneCode: "+236", currency: "XAF", currencySymbol: "FCFA", flag: "🇨🇫", defaultLang: "fr" },

  // --- AFRIQUE DU NORD ---
  { code: "MA", name: "Maroc", phoneCode: "+212", currency: "MAD", currencySymbol: "DH", flag: "🇲🇦", defaultLang: "fr" },
  { code: "TN", name: "Tunisie", phoneCode: "+216", currency: "TND", currencySymbol: "DT", flag: "🇹🇳", defaultLang: "fr" },
  { code: "DZ", name: "Algérie", phoneCode: "+213", currency: "DZD", currencySymbol: "DA", flag: "🇩🇿", defaultLang: "fr" },
  { code: "EG", name: "Égypte", phoneCode: "+20", currency: "EGP", currencySymbol: "E£", flag: "🇪🇬", defaultLang: "en" },

  // --- AFRIQUE DE L'EST ---
  { code: "KE", name: "Kenya", phoneCode: "+254", currency: "KES", currencySymbol: "KSh", flag: "🇰🇪", defaultLang: "en" },
  { code: "TZ", name: "Tanzanie", phoneCode: "+255", currency: "TZS", currencySymbol: "TSh", flag: "🇹🇿", defaultLang: "en" },
  { code: "UG", name: "Ouganda", phoneCode: "+256", currency: "UGX", currencySymbol: "USh", flag: "🇺🇬", defaultLang: "en" },
  { code: "RW", name: "Rwanda", phoneCode: "+250", currency: "RWF", currencySymbol: "FRw", flag: "🇷🇼", defaultLang: "fr" },
  { code: "ET", name: "Éthiopie", phoneCode: "+251", currency: "ETB", currencySymbol: "Br", flag: "🇪🇹", defaultLang: "en" },

  // --- AFRIQUE AUSTRALE & OCÉAN INDIEN ---
  { code: "ZA", name: "Afrique du Sud", phoneCode: "+27", currency: "ZAR", currencySymbol: "R", flag: "🇿🇦", defaultLang: "en" },
  { code: "MG", name: "Madagascar", phoneCode: "+261", currency: "MGA", currencySymbol: "Ar", flag: "🇲🇬", defaultLang: "fr" },
  { code: "MU", name: "Maurice", phoneCode: "+230", currency: "MUR", currencySymbol: "Rs", flag: "🇲🇺", defaultLang: "fr" },
  { code: "AO", name: "Angola", phoneCode: "+244", currency: "AOA", currencySymbol: "Kz", flag: "🇦🇴", defaultLang: "en" },
];

export const SUPPORTED_CURRENCIES = [
  { code: "XOF", symbol: "FCFA", label: "Franc CFA UEMOA (XOF)" },
  { code: "XAF", symbol: "FCFA", label: "Franc CFA CEMAC (XAF)" },
  { code: "NGN", symbol: "₦", label: "Naira nigérian (NGN)" },
  { code: "GHS", symbol: "₵", label: "Cedi ghanéen (GHS)" },
  { code: "GNF", symbol: "FG", label: "Franc guinéen (GNF)" },
  { code: "CDF", symbol: "FC", label: "Franc congolais (CDF)" },
  { code: "MAD", symbol: "DH", label: "Dirham marocain (MAD)" },
  { code: "TND", symbol: "DT", label: "Dinar tunisien (TND)" },
  { code: "DZD", symbol: "DA", label: "Dinar algérien (DZD)" },
  { code: "EGP", symbol: "E£", label: "Livre égyptienne (EGP)" },
  { code: "KES", symbol: "KSh", label: "Shilling kényan (KES)" },
  { code: "TZS", symbol: "TSh", label: "Shilling tanzanien (TZS)" },
  { code: "UGX", symbol: "USh", label: "Shilling ougandais (UGX)" },
  { code: "RWF", symbol: "FRw", label: "Franc rwandais (RWF)" },
  { code: "ETB", symbol: "Br", label: "Birr éthiopien (ETB)" },
  { code: "ZAR", symbol: "R", label: "Rand sud-africain (ZAR)" },
  { code: "MGA", symbol: "Ar", label: "Ariary malgache (MGA)" },
  { code: "MUR", symbol: "Rs", label: "Roupie mauricienne (MUR)" },
  { code: "USD", symbol: "$", label: "Dollar US (USD) [Transactions int.]" },
  { code: "EUR", symbol: "€", label: "Euro (EUR) [Transactions int.]" },
];

export function getCountryByNameOrCode(query: string): CountryConfig | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  return SUPPORTED_COUNTRIES.find(
    (c) => c.code.toLowerCase() === q || c.name.toLowerCase() === q || c.phoneCode === q
  );
}
