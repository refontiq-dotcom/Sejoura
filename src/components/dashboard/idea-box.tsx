"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowBigUp,
  Lightbulb,
  Loader2,
  Camera,
  X,
  Sparkles,
  Wand2,
  Bug,
  Gauge,
  TrendingUp,
  Clock,
  Image as ImageIcon,
  Send,
} from "lucide-react";
import type {
  FeatureRequest,
  FeatureRequestCategory,
  FeatureRequestImpact,
  FeatureRequestStatus,
} from "@/types/database";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple" | "theme" | "outline";

export const FEATURE_REQUEST_STATUSES: Record<
  FeatureRequestStatus,
  { label: string; variant: BadgeVariant }
> = {
  under_review: { label: "En cours d’étude", variant: "info" },
  planned: { label: "Planifié", variant: "warning" },
  in_development: { label: "En développement", variant: "purple" },
  shipped: { label: "Disponible", variant: "success" },
};

export const FEATURE_REQUEST_CATEGORIES: Record<
  FeatureRequestCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  new_feature: { label: "Nouvelle fonctionnalité", icon: Sparkles },
  page_improvement: { label: "Amélioration d’une page", icon: Wand2 },
  bug_report: { label: "Petit bug", icon: Bug },
};

export const FEATURE_REQUEST_IMPACTS: Record<
  FeatureRequestImpact,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  essential: { label: "Essentiel au quotidien", icon: Gauge },
  nice_to_have: { label: "Pratique d’avoir", icon: Lightbulb },
};

export const STATUS_ORDER: FeatureRequestStatus[] = ["under_review", "planned", "in_development", "shipped"];

function formatIdeaDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

// ============================================================================
// MODAL DE SOUMISSION D'UNE IDÉE
// ============================================================================
interface IdeaSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  initialCategory?: FeatureRequestCategory;
}

export function IdeaSubmissionModal({ open, onClose, initialCategory = "new_feature" }: IdeaSubmissionModalProps) {
  const [category, setCategory] = useState<FeatureRequestCategory>(initialCategory);
  const [impact, setImpact] = useState<FeatureRequestImpact>("nice_to_have");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

      // Alerte WhatsApp (fire-and-forget) : l'échec ne bloque jamais l'envoi
      if (inserted?.id) {
        fetch("/api/feature-requests/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inserted.id }),
        }).catch(() => {});
      }

      toast.success("Merci ! Votre suggestion est envoyée 💌");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Impossible d’envoyer votre suggestion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Proposer une idée"
      description="Aidez-nous à améliorer Séjoura. Vos suggestions sont visibles par toute la communauté."
    >
      <div className="space-y-3">
        {/* Catégorie */}
        <div>
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
        <div>
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

        <Input label="Titre *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Export Excel des réservations du mois" maxLength={120} />

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Décrivez précisément ce que vous aimeriez avoir et dans quel contexte…"
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
          />
          <p className="mt-1 text-right text-[10px] text-slate-400">{description.length}/2000</p>
        </div>

        {/* Capture d'écran */}
        <div>
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

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1" onClick={handleSubmit} loading={submitting || uploading}>
            {!submitting && !uploading && <Send className="w-4 h-4" />}
            Envoyer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// SECTION BOÎTE À IDÉES & ROADMAP (onglet Paramètres)
// ============================================================================
type SortMode = "top" | "recent";

export function IdeaBoxSection() {
  const [ideas, setIdeas] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState("");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortMode>("top");
  const [statusFilter, setStatusFilter] = useState<"all" | FeatureRequestStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      const currentUserId = userData?.id || "";
      setMyUserId(currentUserId);

      const [{ data: ideaData }, { data: voteData }] = await Promise.all([
        supabase
          .from("feature_requests")
          .select("*")
          .order("upvotes", { ascending: false })
          .limit(100),
        currentUserId
          ? supabase.from("feature_request_votes").select("feature_request_id").eq("user_id", currentUserId)
          : Promise.resolve({ data: [] }),
      ]);

      if (ideaData) setIdeas(ideaData as unknown as FeatureRequest[]);
      if (voteData) setVotedIds(new Set((voteData as { feature_request_id: string }[]).map((v) => v.feature_request_id)));
    } catch (err) {
      console.error(err);
      toast.error("Les suggestions sont introuvables 🤔");
    } finally {
      setLoading(false);
    }
  }, []);

  // Temps réel : votes et statuts se mettent à jour en direct.
  // Le chargement initial est déclenché par le callback de subscription.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("feature-requests-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_requests" }, () => {
        loadIdeas();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadIdeas();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadIdeas]);

  async function toggleVote(idea: FeatureRequest) {
    if (!myUserId) {
      toast.error("Reconnectez-vous pour voter 🔐");
      return;
    }
    if (idea.created_by === myUserId) {
      toast.info("Vous ne pouvez pas voter pour votre propre suggestion 😄");
      return;
    }
    setVotingId(idea.id);
    try {
      const supabase = createClient();
      if (votedIds.has(idea.id)) {
        const { error } = await supabase
          .from("feature_request_votes")
          .delete()
          .eq("feature_request_id", idea.id)
          .eq("user_id", myUserId);
        if (error) throw error;
        setVotedIds((prev) => {
          const next = new Set(prev);
          next.delete(idea.id);
          return next;
        });
        setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, upvotes: Math.max(0, i.upvotes - 1) } : i)));
      } else {
        const { error } = await supabase
          .from("feature_request_votes")
          .insert({ feature_request_id: idea.id, user_id: myUserId });
        if (error) {
          if ((error as { code?: string }).code === "23505") {
            toast.info("Vous avez déjà voté pour cette suggestion 🗳️");
            loadIdeas();
            return;
          }
          throw error;
        }
        setVotedIds((prev) => new Set(prev).add(idea.id));
        setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, upvotes: i.upvotes + 1 } : i)));
      }
    } catch (err) {
      console.error(err);
      toast.error("Le vote n'a pas pu être enregistré 🗳️");
    } finally {
      setVotingId(null);
    }
  }

  const sortedIdeas = [...ideas];
  if (sortBy === "top") {
    sortedIdeas.sort((a, b) => b.upvotes - a.upvotes);
  } else {
    sortedIdeas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const filteredIdeas = statusFilter === "all" ? sortedIdeas : sortedIdeas.filter((i) => i.status === statusFilter);

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Boîte à idées &amp; Roadmap</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Proposez vos idées, votez pour celles des autres et suivez leur avancement. Votre avis guide nos priorités.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="shrink-0">
            <Lightbulb className="w-4 h-4" /> Proposer une idée
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {/* Tri */}
        <div className="flex rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
          <button
            type="button"
            onClick={() => setSortBy("top")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              sortBy === "top" ? "bg-[var(--primary-color,#0C1C33)] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Top votes
          </button>
          <button
            type="button"
            onClick={() => setSortBy("recent")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              sortBy === "recent" ? "bg-[var(--primary-color,#0C1C33)] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Récentes
          </button>
        </div>

        {/* Filtre par statut */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | FeatureRequestStatus)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
        >
          <option value="all">Tous les statuts</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{FEATURE_REQUEST_STATUSES[s].label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--primary-color,#0C1C33)]" />
        </div>
      ) : filteredIdeas.length === 0 ? (
        <Card className="p-12 text-center">
          <Lightbulb className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune suggestion</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {statusFilter === "all" ? "Soyez le premier à proposer une amélioration." : "Aucune suggestion dans ce statut."}
          </p>
          {statusFilter !== "all" ? (
            <Button variant="outline" onClick={() => setStatusFilter("all")}>Voir toutes les suggestions</Button>
          ) : (
            <Button onClick={() => setModalOpen(true)}>
              <Lightbulb className="w-4 h-4" /> Proposer une idée
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredIdeas.map((idea) => {
            const CategoryIcon = FEATURE_REQUEST_CATEGORIES[idea.category]?.icon || Lightbulb;
            const ImpactIcon = FEATURE_REQUEST_IMPACTS[idea.impact]?.icon || Lightbulb;
            const status = FEATURE_REQUEST_STATUSES[idea.status] || FEATURE_REQUEST_STATUSES.under_review;
            const hasVoted = votedIds.has(idea.id);
            const isOwn = myUserId === idea.created_by;

            return (
              <Card key={idea.id} className="p-3.5">
                <div className="flex gap-3">
                  {/* Bouton de vote */}
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => toggleVote(idea)}
                      disabled={isOwn || votingId === idea.id}
                      title={isOwn ? "Votre propre suggestion" : hasVoted ? "Retirer mon vote" : "Voter pour cette idée"}
                      aria-pressed={hasVoted}
                      aria-label={hasVoted ? "Retirer mon vote" : "Voter pour cette suggestion"}
                      className={`w-11 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        hasVoted
                          ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] text-[var(--primary-color,#0C1C33)]"
                          : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                      }`}
                    >
                      {votingId === idea.id ? (
                        <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                      ) : (
                        <ArrowBigUp className="w-4 h-4 mx-auto" />
                      )}
                      <span className="block text-xs font-bold mt-0.5">{idea.upvotes}</span>
                    </button>
                    <span className="sr-only">Votes : {idea.upvotes}</span>
                  </div>

                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="gap-1">
                        <CategoryIcon className="w-3 h-3" />
                        {FEATURE_REQUEST_CATEGORIES[idea.category]?.label || idea.category}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <ImpactIcon className="w-3 h-3" />
                        {FEATURE_REQUEST_IMPACTS[idea.impact]?.label || idea.impact}
                      </Badge>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-1.5">{idea.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{idea.description}</p>

                    {idea.screenshot_url && (
                      <div className="mt-2">
                        <a
                          href={idea.screenshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={idea.screenshot_url}
                            alt={`Capture d’écran de « ${idea.title} »`}
                            className="max-h-40 rounded-xl border border-slate-200 dark:border-slate-600 object-cover hover:shadow-md transition-shadow"
                          />
                        </a>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Capture d&apos;écran jointe</p>
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">{formatIdeaDate(idea.created_at)}</p>
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

      {modalOpen && <IdeaSubmissionModal open onClose={() => setModalOpen(false)} />}
    </div>
  );
}
