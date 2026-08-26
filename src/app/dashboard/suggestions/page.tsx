"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { LOGIN_ROUTE } from "@/lib/routes";
import {
  FEATURE_REQUEST_CATEGORIES,
  FEATURE_REQUEST_IMPACTS,
  FEATURE_REQUEST_STATUSES,
} from "@/components/dashboard/idea-box";
import type {
  FeatureRequest,
  FeatureRequestCategory,
  FeatureRequestImpact,
  FeatureRequestStatus,
} from "@/types/database";
import {
  ArrowBigUp,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Hammer,
  Inbox,
  Lightbulb,
  Loader2,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";

type ActiveTab = "propose" | "community";
type CommunityTab = "all" | "under_review" | "in_development" | "shipped";

const COMMUNITY_TABS: {
  key: CommunityTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "all", label: "Toutes", icon: Inbox },
  { key: "under_review", label: "En étude", icon: Clock },
  { key: "in_development", label: "En cours", icon: Hammer },
  { key: "shipped", label: "Livrées", icon: CheckCircle2 },
];

// L'onglet "Toutes" couvre tous les statuts ;
// les autres onglets filtrent sur un statut précis de la roadmap.
const STATUS_FILTERS: Partial<Record<CommunityTab, FeatureRequestStatus>> = {
  under_review: "under_review",
  in_development: "in_development",
  shipped: "shipped",
};

interface EnrichedIdea extends FeatureRequest {
  tenant_name?: string | null;
  creator?: { full_name: string } | null;
}

export default function SuggestionsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("propose");
  const [communityTab, setCommunityTab] = useState<CommunityTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [ideas, setIdeas] = useState<EnrichedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState("");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [syncingVotes, setSyncingVotes] = useState<Set<string>>(new Set());

  // Formulaire « Proposer une idée »
  const [category, setCategory] = useState<FeatureRequestCategory>("new_feature");
  const [impact, setImpact] = useState<FeatureRequestImpact>("nice_to_have");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = LOGIN_ROUTE;
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      const currentUserId = userData?.id || "";
      setMyUserId(currentUserId);

      const [{ data: ideaData }, { data: voteData }, { data: tenantData }, { data: authorData }] =
        await Promise.all([
          supabase.from("feature_requests").select("*").order("created_at", { ascending: false }).limit(200),
          currentUserId
            ? supabase.from("feature_request_votes").select("feature_request_id").eq("user_id", currentUserId)
            : Promise.resolve({ data: [] }),
          supabase.from("tenants").select("id, company_name"),
          supabase.from("users").select("id, full_name"),
        ]);

      const tenantNames = new Map((tenantData || []).map((t) => [t.id, t.company_name]));
      const authorNames = new Map((authorData || []).map((u) => [u.id, u.full_name]));

      setIdeas((ideaData || []).map((idea) => {
        const feature = idea as unknown as FeatureRequest;
        return {
          ...feature,
          tenant_name: tenantNames.get(feature.tenant_id) || null,
          creator: { full_name: authorNames.get(feature.created_by) || "Membre" },
        };
      }));
      setVotedIds(new Set((voteData || []).map((v) => v.feature_request_id as string)));
    } catch (err) {
      console.error(err);
      toast.error("Les suggestions sont introuvables 🤔");
    } finally {
      setLoading(false);
    }
  }, []);

  // Temps réel : nouvelles idées et changements de statut se reflètent en direct.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("suggestions-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_requests" }, () => {
        loadData();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadData();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // ==========================================================================
  // VOTE AVEC MISE À JOUR OPTIMISTE
  // ==========================================================================
  async function toggleVote(idea: EnrichedIdea) {
    if (!myUserId) {
      toast.error("Reconnectez-vous pour voter 🔐");
      return;
    }
    if (idea.created_by === myUserId) {
      toast.info("Vous ne pouvez pas voter pour votre propre suggestion 😄");
      return;
    }
    if (syncingVotes.has(idea.id)) return;

    const wasVoted = votedIds.has(idea.id);
    const delta = wasVoted ? -1 : 1;

    // 1. Mise à jour instantanée côté client (optimistic UI)
    setSyncingVotes((prev) => new Set(prev).add(idea.id));
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(idea.id);
      else next.add(idea.id);
      return next;
    });
    setIdeas((prev) =>
      prev.map((i) => (i.id === idea.id ? { ...i, upvotes: Math.max(0, i.upvotes + delta) } : i))
    );

    // 2. Synchronisation avec Supabase
    try {
      const supabase = createClient();
      const { error } = wasVoted
        ? await supabase
            .from("feature_request_votes")
            .delete()
            .eq("feature_request_id", idea.id)
            .eq("user_id", myUserId)
        : await supabase
            .from("feature_request_votes")
            .insert({ feature_request_id: idea.id, user_id: myUserId });
      if (error) throw error;
    } catch (err) {
      // 3. En cas d'échec : annulation (rollback) et resynchronisation
      console.error(err);
      setVotedIds((prev) => {
        const next = new Set(prev);
        if (wasVoted) next.add(idea.id);
        else next.delete(idea.id);
        return next;
      });
      setIdeas((prev) =>
        prev.map((i) => (i.id === idea.id ? { ...i, upvotes: Math.max(0, i.upvotes - delta) } : i))
      );
      if ((err as { code?: string }).code === "23505") {
        toast.info("Vous avez déjà voté pour cette suggestion 🗳️");
        loadData();
      } else {
        toast.error("Le vote n'a pas pu être enregistré 🗳️");
      }
    } finally {
      setSyncingVotes((prev) => {
        const next = new Set(prev);
        next.delete(idea.id);
        return next;
      });
    }
  }

  // ==========================================================================
  // FORMULAIRE « PROPOSER UNE IDÉE »
  // ==========================================================================
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] || null;
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      toast.error("Choisissez une image 📸");
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function removeFile() {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadScreenshot(): Promise<string | null> {
    if (!file) return null;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/feature-requests/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Impossible de téléverser l’image.");
        return null;
      }
      return data.url as string;
    } catch {
      toast.error("Impossible de téléverser l’image.");
      return null;
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    setCategory("new_feature");
    setImpact("nice_to_have");
    setTitle("");
    setDescription("");
    removeFile();
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (trimmedTitle.length < 3) {
      toast.error("Le titre doit faire au moins 3 caractères 📝");
      return;
    }
    if (trimmedDescription.length < 10) {
      toast.error("La description doit faire au moins 10 caractères 📝");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expirée. Reconnectez-vous 🔐");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("id, tenant_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (!userData?.tenant_id || !userData.id) {
        toast.error("Impossible d’identifier votre compte.");
        return;
      }

      const screenshotUrl = await uploadScreenshot();
      if (file && !screenshotUrl) return; // l'upload a échoué : on ne crée pas l'idée

      const { data: inserted, error } = await supabase
        .from("feature_requests")
        .insert({
          tenant_id: userData.tenant_id,
          created_by: userData.id,
          title: trimmedTitle,
          description: trimmedDescription,
          category,
          impact,
          screenshot_url: screenshotUrl,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Alerte (fire-and-forget) : l'échec ne bloque jamais l'envoi
      if (inserted?.id) {
        fetch("/api/feature-requests/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inserted.id }),
        }).catch(() => {});
      }

      toast.success("Merci ! Votre suggestion est envoyée 💌");
      resetForm();
      setActiveTab("community");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Impossible d’envoyer votre suggestion.");
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================================================
  // FILTRAGE / TRI DES IDÉES
  // ==========================================================================
  const filteredIdeas = useMemo(() => {
    const statusFilter = STATUS_FILTERS[communityTab];
    let list = ideas.filter((i) => !statusFilter || i.status === statusFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          (i.tenant_name || "").toLowerCase().includes(q)
      );
    }

    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [ideas, communityTab, searchQuery]);

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      active
        ? "bg-[var(--primary-color,#0C1C33)] text-white shadow-md"
        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/40"
    }`;

  return (
    <div className="max-w-3xl mx-auto">
      {/* En-tête de page */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-[var(--primary-color,#0C1C33)] flex items-center justify-center shrink-0">
          <Lightbulb className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Suggestions de la communauté</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Proposez vos idées, votez pour celles des autres et suivez la roadmap.
          </p>
        </div>
      </div>

      {/* Onglets principaux */}
      <div className="flex gap-2 mb-5">
        <button type="button" onClick={() => setActiveTab("propose")} className={tabClass(activeTab === "propose")}>
          <Lightbulb className="w-4 h-4" /> Proposer une idée
        </button>
        <button type="button" onClick={() => setActiveTab("community")} className={tabClass(activeTab === "community")}>
          <Inbox className="w-4 h-4" /> Idées de la communauté
        </button>
      </div>

      {/* =====================================================================
          ONGLET 1 : FORMULAIRE DE CRÉATION
          ===================================================================== */}
      {activeTab === "propose" && (
        <div className="space-y-4">
          <Card className="p-4 bg-[var(--primary-muted)] border-[var(--primary-color)]/20">
            <p className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
              <Search className="w-4 h-4 text-[var(--primary-color,#0C1C33)] shrink-0 mt-0.5" />
              <span>
                Astuce : avant de proposer, recherchez une idée existante dans l&apos;onglet{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("community")}
                  className="font-semibold text-[var(--primary-color,#0C1C33)] underline underline-offset-2"
                >
                  Idées de la communauté
                </button>{" "}
                pour éviter les doublons.
              </span>
            </p>
          </Card>

          <Card className="p-4">
            {/* Catégorie */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Catégorie *</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FEATURE_REQUEST_CATEGORIES) as FeatureRequestCategory[]).map((key) => {
                  const cfg = FEATURE_REQUEST_CATEGORIES[key];
                  const Icon = cfg.icon;
                  const active = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all ${
                        active
                          ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] text-[var(--primary-color,#0C1C33)]"
                          : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Impact */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Impact pour votre quotidien</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FEATURE_REQUEST_IMPACTS) as FeatureRequestImpact[]).map((key) => {
                  const cfg = FEATURE_REQUEST_IMPACTS[key];
                  const Icon = cfg.icon;
                  const active = impact === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setImpact(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                        active
                          ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] text-[var(--primary-color,#0C1C33)]"
                          : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <Input
                label="Titre *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Export Excel des réservations du mois"
                maxLength={120}
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Décrivez précisément ce que vous aimeriez avoir et dans quel contexte…"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
              />
              <p className="mt-1 text-right text-[10px] text-slate-400">{description.length}/2000</p>
            </div>

            {/* Capture d'écran */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Capture d’écran (optionnel)</label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              {previewUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Aperçu de la capture" className="max-h-40 rounded-xl border border-slate-200 dark:border-slate-600" />
                  <button
                    type="button"
                    onClick={removeFile}
                    aria-label="Retirer l’image"
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/60 text-white hover:bg-slate-900/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Ajouter une capture d’écran
                </button>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={resetForm}>Réinitialiser</Button>
              <Button onClick={handleSubmit} loading={submitting || uploading}>
                {!submitting && !uploading && <Send className="w-4 h-4" />}
                Envoyer ma suggestion
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* =====================================================================
          ONGLET 2 : IDÉES DE LA COMMUNAUTÉ
          ===================================================================== */}
      {activeTab === "community" && (
        <div className="space-y-4">
          {/* Filtres de statut */}
          <div className="flex flex-wrap gap-2">
            {COMMUNITY_TABS.map(({ key, label, icon: Icon }) => {
              const active = communityTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCommunityTab(key)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    active
                      ? "bg-[var(--primary-color,#0C1C33)] text-white border-transparent shadow-md"
                      : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une idée existante avant d’en créer une nouvelle…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            />
          </div>

          {/* Liste des idées */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
            </div>
          ) : filteredIdeas.length === 0 ? (
            <Card className="p-12 text-center">
              <Lightbulb className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                {searchQuery.trim() || communityTab !== "all" ? "Aucune idée trouvée" : "Aucune suggestion"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchQuery.trim()
                  ? "Aucune idée ne correspond à votre recherche. Soyez le premier à la proposer !"
                  : communityTab !== "all"
                    ? "Aucune idée ne correspond à ce filtre pour le moment."
                    : "Soyez le premier à proposer une amélioration."}
              </p>
              {searchQuery.trim() || communityTab !== "all" ? (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <Button variant="outline" onClick={() => { setSearchQuery(""); setCommunityTab("all"); }}>
                    Réinitialiser les filtres
                  </Button>
                  <Button onClick={() => setActiveTab("propose")}>
                    <Lightbulb className="w-4 h-4" /> Proposer une idée
                  </Button>
                </div>
              ) : (
                <Button className="mt-4" onClick={() => setActiveTab("propose")}>
                  <Lightbulb className="w-4 h-4" /> Proposer une idée
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredIdeas.map((idea) => {
                const CategoryIcon = FEATURE_REQUEST_CATEGORIES[idea.category]?.icon || Lightbulb;
                const status = FEATURE_REQUEST_STATUSES[idea.status] || FEATURE_REQUEST_STATUSES.under_review;
                const hasVoted = votedIds.has(idea.id);
                const isOwn = myUserId === idea.created_by;
                const syncing = syncingVotes.has(idea.id);

                return (
                  <Card key={idea.id} className="p-4">
                    <div className="flex gap-4">
                      {/* Bouton de vote (à gauche) */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleVote(idea)}
                          disabled={isOwn || syncing}
                          title={
                            isOwn
                              ? "Votre propre suggestion"
                              : hasVoted
                                ? "Retirer mon vote"
                                : "Voter pour cette idée"
                          }
                          aria-pressed={hasVoted}
                          aria-label={
                            isOwn
                              ? "Votre propre suggestion"
                              : hasVoted
                                ? "Retirer mon vote"
                                : "Voter pour cette suggestion"
                          }
                          className={`w-12 py-2 rounded-xl border flex flex-col items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            hasVoted
                              ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-color,#0C1C33)] text-white shadow-md"
                              : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/30 hover:text-[var(--primary-color,#0C1C33)]"
                          }`}
                        >
                          {syncing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <ArrowBigUp className="w-5 h-5" />
                          )}
                          <span className="text-xs font-bold mt-0.5">{idea.upvotes}</span>
                        </button>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">votes</span>
                      </div>

                      {/* Contenu (à droite) */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{idea.title}</h3>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {idea.tenant_name || "Communauté Séjoura"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {idea.creator?.full_name || "Membre"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CategoryIcon className="w-3 h-3" />
                            {FEATURE_REQUEST_CATEGORIES[idea.category]?.label || idea.category}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 whitespace-pre-wrap line-clamp-3">
                          {idea.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                            <Calendar className="w-3 h-3" />
                            Publiée le {formatDate(idea.created_at)}
                          </span>
                          {isOwn && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                              <Lightbulb className="w-3 h-3" />
                              Ma suggestion
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Les suggestions sont visibles par toute la communauté Séjoura. Les votes déterminent nos priorités.
          </p>
        </div>
      )}
    </div>
  );
}
