"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Save,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Provider = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  docsUrl: string;
  fields: FieldDef[];
};

type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  hint?: string;
};

type GatewayRow = {
  id: string;
  tenant_id: string;
  provider: string;
  api_keys: Record<string, string>;
  is_active: boolean;
};

// ─── Configuration des providers ─────────────────────────────────────────────

const PROVIDERS: Provider[] = [
  {
    key: "wave",
    name: "Wave",
    emoji: "🌊",
    color: "#0070F3",
    description: "Paiement mobile Wave CI — Intégration directe via l'API Wave Business.",
    docsUrl: "https://developer.wave.com",
    fields: [
      {
        key: "api_key",
        label: "Clé API Wave (Secret Key)",
        placeholder: "wave_sn_live_xxxxxxxxxxxx",
        secret: true,
        hint: "Clé secrète disponible dans votre dashboard Wave Business.",
      },
      {
        key: "merchant_id",
        label: "Identifiant marchand (Merchant ID)",
        placeholder: "merchant_xxxxxxxx",
        hint: "Visible dans Paramètres > Compte sur Wave Business.",
      },
    ],
  },
  {
    key: "orange_money",
    name: "Orange Money",
    emoji: "🟠",
    color: "#FF6B00",
    description: "Paiement mobile Orange Money CI/SN — API Orange Developer.",
    docsUrl: "https://developer.orange.com/apis/om-webpay",
    fields: [
      {
        key: "client_id",
        label: "Client ID (App Orange Developer)",
        placeholder: "xxxxxxxxxxxxxxxxxxx",
        hint: "Disponible dans votre application Orange Developer.",
      },
      {
        key: "client_secret",
        label: "Client Secret",
        placeholder: "xxxxxxxxxxxxxxxxxxx",
        secret: true,
      },
      {
        key: "merchant_number",
        label: "Numéro marchand Orange Money",
        placeholder: "07XXXXXXXX",
        hint: "Votre numéro de téléphone Orange marchand.",
      },
    ],
  },
  {
    key: "mtn",
    name: "MTN Mobile Money",
    emoji: "🟡",
    color: "#FFC107",
    description: "Paiement mobile MTN MoMo — API MTN Developer Portal.",
    docsUrl: "https://momodeveloper.mtn.com",
    fields: [
      {
        key: "subscription_key",
        label: "Subscription Key (Ocp-Apim-Subscription-Key)",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        secret: true,
        hint: "Disponible dans votre abonnement MTN Developer.",
      },
      {
        key: "api_user",
        label: "API User (UUID)",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        hint: "Généré lors de la création de l'utilisateur API.",
      },
      {
        key: "api_key",
        label: "API Key",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        secret: true,
      },
    ],
  },
  {
    key: "moov_africa",
    name: "Moov Africa",
    emoji: "🔵",
    color: "#0033A0",
    description: "Paiement mobile Moov Africa CI/BJ — API Flooz Pay.",
    docsUrl: "https://developer.moov-africa.com",
    fields: [
      {
        key: "api_key",
        label: "Clé API Moov Africa",
        placeholder: "xxxxxxxxxxxxxxxxxxxx",
        secret: true,
        hint: "Disponible dans votre espace développeur Moov.",
      },
      {
        key: "merchant_code",
        label: "Code Marchand",
        placeholder: "MCH_XXXX",
        hint: "Code attribué lors de l'enrôlement marchand.",
      },
    ],
  },
  {
    key: "pi_spi",
    name: "PI-SPI (BCEAO)",
    emoji: "🏦",
    color: "#1A3C5E",
    description: "Plateforme Interbancaire de Services de Paiement Interopérables de la BCEAO — Paiement interbancaire UEMOA.",
    docsUrl: "https://www.bceao.int",
    fields: [
      {
        key: "merchant_id",
        label: "Identifiant Marchand PI-SPI",
        placeholder: "PISPI_XXXXXXXXXXXX",
        hint: "Attribué par votre banque partenaire après enrôlement.",
      },
      {
        key: "secret_key",
        label: "Clé secrète PI-SPI",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        secret: true,
        hint: "Clé secrète transmise lors de l'activation du service.",
      },
      {
        key: "bank_code",
        label: "Code banque partenaire",
        placeholder: "ex: BNI-CI, SIB, SGBCI",
        hint: "Le code de votre banque partenaire BCEAO.",
      },
    ],
  },
];

// ─── Composant Carte Provider ─────────────────────────────────────────────────

function ProviderCard({
  provider,
  data,
  onSave,
  onToggle,
  loading,
}: {
  provider: Provider;
  data: GatewayRow | null;
  onSave: (provider: string, fields: Record<string, string>) => Promise<void>;
  onToggle: (provider: string, isActive: boolean) => Promise<void>;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    provider.fields.forEach((f) => {
      init[f.key] = data?.api_keys?.[f.key] ?? "";
    });
    return init;
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const isConfigured = data && Object.values(data.api_keys ?? {}).some((v) => v.length > 0);
  const isActive = data?.is_active ?? false;

  const allFilled = provider.fields.every((f) => fields[f.key]?.trim().length > 0);

  const handleSave = async () => {
    setSaving(true);
    await onSave(provider.key, fields);
    setSaving(false);
  };

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(provider.key, !isActive);
    setToggling(false);
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isActive
          ? "border-green-400/60 dark:border-green-500/40 bg-green-50/30 dark:bg-green-900/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      }`}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: `${provider.color}15`, border: `1.5px solid ${provider.color}40` }}
          >
            {provider.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{provider.name}</span>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Configuré
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <XCircle className="w-3 h-3" />
                  Non configuré
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md line-clamp-1">
              {provider.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConfigured && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={isActive ? "Désactiver" : "Activer"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-400 dark:bg-green-900/30"
                  : "text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-400 dark:bg-slate-800"
              }`}
            >
              {toggling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isActive ? (
                <ToggleRight className="w-3.5 h-3.5" />
              ) : (
                <ToggleLeft className="w-3.5 h-3.5" />
              )}
              {isActive ? "Actif" : "Inactif"}
            </button>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            {expanded ? "Fermer" : "Configurer"}
          </button>
        </div>
      </div>

      {/* Formulaire de configuration */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-4">
          {/* Alerte sécurité */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Ces clés sont stockées de manière sécurisée et chiffrée. Ne les partagez jamais.
              Seul votre serveur y a accès.
            </p>
          </div>

          {/* Champs */}
          <div className="space-y-3">
            {provider.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {field.label}
                </label>
                <div className="relative">
                  <input
                    type={field.secret && !showSecrets[field.key] ? "password" : "text"}
                    value={fields[field.key] ?? ""}
                    onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 pr-10 transition-all"
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showSecrets[field.key] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                {field.hint && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">💡 {field.hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              📖 Documentation officielle {provider.name}
            </a>
            <button
              onClick={handleSave}
              disabled={saving || !allFilled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                allFilled
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function PaymentGatewaysSection() {
  const supabase = createClient();
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGateways();
  }, []);

  const loadGateways = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_payment_gateways")
      .select("*");
    if (!error && data) setGateways(data);
    setLoading(false);
  };

  const getGateway = (provider: string) =>
    gateways.find((g) => g.provider === provider) ?? null;

  const handleSave = async (provider: string, fields: Record<string, string>) => {
    const existing = getGateway(provider);
    let error;

    if (existing) {
      ({ error } = await supabase
        .from("tenant_payment_gateways")
        .update({ api_keys: fields, updated_at: new Date().toISOString() })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase
        .from("tenant_payment_gateways")
        .insert({ provider, api_keys: fields, is_active: false }));
    }

    if (error) {
      toast.error("Erreur lors de l'enregistrement des clés API.");
    } else {
      toast.success(`Clés ${provider} enregistrées avec succès.`);
      loadGateways();
    }
  };

  const handleToggle = async (provider: string, isActive: boolean) => {
    const existing = getGateway(provider);
    if (!existing) return;

    const { error } = await supabase
      .from("tenant_payment_gateways")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      toast.error("Erreur lors de la mise à jour.");
    } else {
      toast.success(isActive ? `${provider} activé ✓` : `${provider} désactivé`);
      loadGateways();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info globale */}
      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💳</span>
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Intégration directe des opérateurs (Sans agrégateur)
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Configurez vos clés API pour accepter les paiements en ligne directement depuis Trouvetou.
              Les clients pourront payer leur acompte au moment de la réservation, sans passer par un tiers.
              Seuls les modes de paiement <strong>actifs</strong> seront proposés aux clients.
            </p>
          </div>
        </div>
      </div>

      {/* Cards providers */}
      {PROVIDERS.map((provider) => (
        <ProviderCard
          key={provider.key}
          provider={provider}
          data={getGateway(provider.key)}
          onSave={handleSave}
          onToggle={handleToggle}
          loading={loading}
        />
      ))}
    </div>
  );
}
