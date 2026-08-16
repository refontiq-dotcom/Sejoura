"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Phone,
  Smartphone,
  Info,
  AlertTriangle,
  X,
  Save,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getGuestInfoIcon,
  GUEST_INFO_ICON_OPTIONS,
  resolvePrimaryColor,
} from "@/lib/guest-info";
import type { GuestInfo, GuestInfoItem, HouseRule } from "@/types/database";

interface Branding {
  company_name: string;
  logo_url: string | null;
  primary_color: string | null;
}

interface GuestInfoEditorProps {
  initial: GuestInfo | null;
  branding: Branding;
  saving: boolean;
  onSave: (info: GuestInfo) => Promise<boolean>;
}

function emptyInfo(): GuestInfoItem {
  return { icon: "wifi", label: "", value: "" };
}

function emptyRule(): HouseRule {
  return { title: "", description: "" };
}

export function GuestInfoEditor({ initial, branding, saving, onSave }: GuestInfoEditorProps) {
  const [practicalInfo, setPracticalInfo] = useState<GuestInfoItem[]>(
    initial?.practical_info?.length ? [...initial.practical_info] : []
  );
  const [houseRules, setHouseRules] = useState<HouseRule[]>(
    initial?.house_rules?.length ? [...initial.house_rules] : []
  );
  const [checkinNote, setCheckinNote] = useState(initial?.checkin_note ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(initial?.emergency_phone ?? "");

  const primaryColor = resolvePrimaryColor(branding.primary_color);

  const hasContent =
    practicalInfo.some((i) => i.label || i.value) ||
    houseRules.some((r) => r.title) ||
    checkinNote.trim() !== "" ||
    emergencyPhone.trim() !== "";

  function patchInfo(index: number, patch: Partial<GuestInfoItem>) {
    setPracticalInfo((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function patchRule(index: number, patch: Partial<HouseRule>) {
    setHouseRules((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function move<T>(list: T[], index: number, dir: -1 | 1, setList: (next: T[]) => void) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setList(next);
  }

  async function handleSave() {
    const info: GuestInfo = {
      practical_info: practicalInfo.filter((i) => i.label.trim() || i.value.trim()),
      house_rules: houseRules.filter((r) => r.title.trim()),
      checkin_note: checkinNote.trim() || undefined,
      emergency_phone: emergencyPhone.trim() || undefined,
    };
    await onSave(info);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* ── Formulaire ── */}
      <div className="space-y-4 lg:col-span-3">
        {/* Infos pratiques */}
        <Card className="p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Infos pratiques</h3>
              <p className="text-[11px] text-[var(--foreground-muted)]">
                Wi-Fi, horaires, petit-déjeuner… affichées sur la page client.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {practicalInfo.length === 0 && (
              <p className="rounded-lg border border-dashed border-[var(--border-card)] px-3 py-4 text-center text-[11px] text-[var(--foreground-muted)]">
                Aucune info pratique configurée.
              </p>
            )}
            {practicalInfo.map((item, index) => (
              <div key={index} className="rounded-xl border border-[var(--border-card)] bg-[var(--surface-sunken)] p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                    Info {index + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <IconBtn disabled={index === 0} onClick={() => move(practicalInfo, index, -1, setPracticalInfo)} title="Monter">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn disabled={index === practicalInfo.length - 1} onClick={() => move(practicalInfo, index, 1, setPracticalInfo)} title="Descendre">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => setPracticalInfo((prev) => prev.filter((_, i) => i !== index))} title="Supprimer" danger>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <select
                      value={item.icon}
                      onChange={(e) => patchInfo(index, { icon: e.target.value })}
                      className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1.5 focus:ring-[var(--primary-color,#0C1C33)]"
                    >
                      {GUEST_INFO_ICON_OPTIONS.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-8">
                    <Input
                      placeholder="Libellé (ex : Wi-Fi)"
                      value={item.label}
                      onChange={(e) => patchInfo(index, { label: e.target.value })}
                    />
                  </div>
                </div>
                <Input
                  className="mt-2"
                  placeholder="Valeur (ex : Séjoura-5G — code 12345678)"
                  value={item.value}
                  onChange={(e) => patchInfo(index, { value: e.target.value })}
                />
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => setPracticalInfo((prev) => [...prev, emptyInfo()])}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Ajouter une info pratique
          </Button>
        </Card>

        {/* Règlement intérieur */}
        <Card className="p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Règlement intérieur</h3>
            <p className="text-[11px] text-[var(--foreground-muted)]">
              Les règles de vie de l&apos;établissement communiquées à vos clients.
            </p>
          </div>

          <div className="space-y-2">
            {houseRules.length === 0 && (
              <p className="rounded-lg border border-dashed border-[var(--border-card)] px-3 py-4 text-center text-[11px] text-[var(--foreground-muted)]">
                Aucune règle configurée.
              </p>
            )}
            {houseRules.map((rule, index) => (
              <div key={index} className="rounded-xl border border-[var(--border-card)] bg-[var(--surface-sunken)] p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                    Règle {index + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <IconBtn disabled={index === 0} onClick={() => move(houseRules, index, -1, setHouseRules)} title="Monter">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn disabled={index === houseRules.length - 1} onClick={() => move(houseRules, index, 1, setHouseRules)} title="Descendre">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn onClick={() => setHouseRules((prev) => prev.filter((_, i) => i !== index))} title="Supprimer" danger>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </div>
                <Input
                  placeholder="Règle (ex : Fumer est interdit)"
                  value={rule.title}
                  onChange={(e) => patchRule(index, { title: e.target.value })}
                />
                <Input
                  className="mt-2"
                  placeholder="Précision (facultatif, ex : dans les chambres et parties communes)"
                  value={rule.description ?? ""}
                  onChange={(e) => patchRule(index, { description: e.target.value })}
                />
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => setHouseRules((prev) => [...prev, emptyRule()])}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Ajouter une règle
          </Button>
        </Card>

        {/* Note de check-in + urgence */}
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">Accueil & urgence</h3>
          <p className="mb-3 text-[11px] text-[var(--foreground-muted)]">
            Affichés en bonne place pour aider vos clients dès leur arrivée.
          </p>
          <div className="space-y-3">
            <Input
              label="Note de check-in (facultatif)"
              placeholder="Ex : Arrivée après 20h, veuillez prévenir la réception"
              value={checkinNote}
              onChange={(e) => setCheckinNote(e.target.value)}
            />
            <Input
              label="Numéro d'urgence (facultatif)"
              placeholder="Ex : +225 07 00 00 00 00"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              icon={<Phone className="h-3.5 w-3.5" />}
            />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleSave} loading={saving} disabled={!hasContent && saving}>
            <Save className="mr-1.5 h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </div>

      {/* ── Aperçu live ── */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-[var(--foreground-muted)]">
            <Smartphone className="h-3.5 w-3.5" /> Aperçu sur la page client
          </div>
          <GuestPortalPreview
            branding={branding}
            primaryColor={primaryColor}
            practicalInfo={practicalInfo}
            houseRules={houseRules}
            checkinNote={checkinNote}
            emergencyPhone={emergencyPhone}
          />
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1 transition-colors ${
        disabled
          ? "cursor-not-allowed text-[var(--foreground-subtle)] opacity-40"
          : danger
            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            : "text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

function GuestPortalPreview({
  branding,
  primaryColor,
  practicalInfo,
  houseRules,
  checkinNote,
  emergencyPhone,
}: {
  branding: Branding;
  primaryColor: string;
  practicalInfo: GuestInfoItem[];
  houseRules: HouseRule[];
  checkinNote: string;
  emergencyPhone: string;
}) {
  const filledInfo = practicalInfo.filter((i) => i.label.trim() && i.value.trim());
  const filledRules = houseRules.filter((r) => r.title.trim());

  return (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[28px] border-[5px] border-slate-800 bg-slate-100 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div
        className="px-4 pb-4 pt-5 text-white"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, color-mix(in srgb, ${primaryColor} 75%, #0C1C33) 100%)`,
        }}
      >
        <p className="text-[9px] uppercase tracking-wider text-white/70">{branding.company_name || "Mon établissement"}</p>
        <p className="text-xs font-bold">Bonjour et bienvenue</p>
      </div>

      <div className="space-y-2.5 p-3">
        {/* Infos pratiques */}
        <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
          <p className="mb-2 text-[10px] font-bold text-slate-700 dark:text-slate-200">Informations pratiques</p>
          <ul className="space-y-1.5 text-[10px]">
            <li className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
              <Info className="mt-px h-3 w-3 shrink-0" />
              <span>{branding.company_name || "Mon établissement"}</span>
            </li>
            {filledInfo.length === 0 ? (
              <li className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                <Wifi className="mt-px h-3 w-3 shrink-0" />
                <span>Wi-Fi gratuit disponible</span>
              </li>
            ) : (
              filledInfo.map((item, index) => {
                const Icon = getGuestInfoIcon(item.icon);
                return (
                  <li key={index} className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                    <Icon className="mt-px h-3 w-3 shrink-0" />
                    <span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
                      {" : "}
                      {item.value}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Note de check-in */}
        {checkinNote.trim() !== "" && (
          <div className="flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-[10px] text-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>{checkinNote}</span>
          </div>
        )}

        {/* Règlement */}
        {filledRules.length > 0 && (
          <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
            <p className="mb-2 text-[10px] font-bold text-slate-700 dark:text-slate-200">Règlement de l&apos;établissement</p>
            <ol className="space-y-1.5 text-[10px]">
              {filledRules.map((rule, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: primaryColor }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{rule.title}</span>
                    {rule.description ? <span className="text-slate-500 dark:text-slate-400"> — {rule.description}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Urgence */}
        {emergencyPhone.trim() !== "" && (
          <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-[10px] text-red-700 dark:bg-red-900/20 dark:text-red-300">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Urgence — {emergencyPhone}</span>
          </div>
        )}

        {filledInfo.length === 0 && filledRules.length === 0 && checkinNote.trim() === "" && emergencyPhone.trim() === "" && (
          <p className="flex items-center gap-1.5 rounded-2xl bg-white p-3 text-[10px] text-slate-400 shadow-sm dark:bg-slate-800">
            <X className="h-3 w-3" /> Remplissez le formulaire pour voir l&apos;aperçu.
          </p>
        )}
      </div>
    </div>
  );
}
