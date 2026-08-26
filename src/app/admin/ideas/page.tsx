"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { LOGIN_ROUTE } from "@/lib/routes";
import {
  FEATURE_REQUEST_CATEGORIES,
  FEATURE_REQUEST_IMPACTS,
  FEATURE_REQUEST_STATUSES,
  STATUS_ORDER,
} from "@/components/dashboard/idea-box";
import type { FeatureRequest, FeatureRequestStatus } from "@/types/database";
import {
  Shield,
  Loader2,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  TrendingUp,
  Clock,
  Lightbulb,
  ArrowLeft,
  ThumbsUp,
  ListChecks,
  MessageSquareOff,
} from "lucide-react";

type StatusFilter = "all" | FeatureRequestStatus;
type CategoryFilter = "all" | FeatureRequest["category"];
type VisibilityFilter = "all" | "shown" | "hidden";
type SortMode = "upvotes" | "recent";

export default function AdminIdeasPage() {
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState<FeatureRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [sortBy, setSortBy] = useState<SortMode>("upvotes");
  const [actioningId, setActioningId] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = LOGIN_ROUTE;
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData || userData.role !== "super_admin") {
        window.location.href = LOGIN_ROUTE;
        return;
      }

      const [{ data: ideaData }, { data: tenantData }, { data: authorData }] = await Promise.all([
        supabase.from("feature_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("tenants").select("id, company_name"),
        supabase.from("users").select("id, full_name"),
      ]);

      const tenantNames = new Map((tenantData || []).map((t) => [t.id, t.company_name]));
      const authorNames = new Map((authorData || []).map((u) => [u.id, u.full_name]));

      const enriched = (ideaData || []).map((idea) => {
        const feature = idea as unknown as FeatureRequest;
        return {
          ...feature,
          tenant_name: tenantNames.get(feature.tenant_id) || null,
          creator: { full_name: authorNames.get(feature.created_by) || "Utilisateur" },
        };
      });

      setIdeas(enriched);
    } catch (err) {
      console.error(err);
      toast.error("Les suggestions sont introuvables 🤔");
    } finally {
      setLoading(false);
    }
  }, []);

  // Temps réel : statuts, masquage et nouveaux votes se mettent à jour en direct.
  // Le chargement initial est déclenché par le callback de subscription.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-ideas-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_requests" }, () => {
        loadData(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_request_votes" }, () => {
        loadData(true);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadData();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  async function updateStatus(idea: FeatureRequest, status: FeatureRequestStatus) {
    if (idea.status === status) return;
    setActioningId(idea.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("feature_requests")
        .update({ status })
        .eq("id", idea.id);
      if (error) throw error;
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status } : i)));
      toast.success(`Statut mis à jour : ${FEATURE_REQUEST_STATUSES[status].label} ✅`);
    } catch (err) {
      console.error(err);
      toast.error("Le statut n'a pas pu être mis à jour 🔄");
    } finally {
      setActioningId(null);
    }
  }

  async function toggleHidden(idea: FeatureRequest) {
    setActioningId(idea.id);
    try {
      const supabase = createClient();
      const next = !idea.hidden;
      const { error } = await supabase
        .from("feature_requests")
        .update({ hidden: next })
        .eq("id", idea.id);
      if (error) throw error;
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, hidden: next } : i)));
      toast.success(next ? "Suggestion masquée (cachée des clients)." : "Suggestion réaffichée.");
    } catch (err) {
      console.error(err);
      toast.error("La visibilité n'a pas pu être modifiée 🔄");
    } finally {
      setActioningId(null);
    }
  }

  const filteredIdeas = useMemo(() => {
    let list = [...ideas];
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((i) => i.category === categoryFilter);
    if (visibilityFilter !== "all") list = list.filter((i) => (visibilityFilter === "hidden" ? i.hidden : !i.hidden));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          (i.tenant_name || "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "upvotes") {
      list.sort((a, b) => b.upvotes - a.upvotes);
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [ideas, statusFilter, categoryFilter, visibilityFilter, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const totalVotes = ideas.reduce((sum, i) => sum + i.upvotes, 0);
    return {
      total: ideas.length,
      totalVotes,
      underReview: ideas.filter((i) => i.status === "under_review").length,
      hidden: ideas.filter((i) => i.hidden).length,
    };
  }, [ideas]);

  const filterClass = "px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]";

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[var(--primary-color,#0C1C33)] flex items-center justify-center">
          <Lightbulb className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Boîte à idées &amp; Roadmap</h1>
          <p className="text-sm text-slate-500">
            Organisez et pilotez les suggestions des clients
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => loadData(true)} className="shrink-0">
            <RefreshCw className="w-4 h-4" /> Rafraîchir
          </Button>
          <a
            href="/admin/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard Admin
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-slate-400" /> {stats.total}
          </p>
          <p className="text-xs text-slate-400">Suggestions totales</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ThumbsUp className="w-5 h-5 text-slate-400" /> {stats.totalVotes}
          </p>
          <p className="text-xs text-slate-400">Votes cumulés</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-blue-600 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" /> {stats.underReview}
          </p>
          <p className="text-xs text-slate-400">À l&apos;étude</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-amber-600 flex items-center gap-2">
            <MessageSquareOff className="w-5 h-5 text-amber-400" /> {stats.hidden}
          </p>
          <p className="text-xs text-slate-400">Masquées</p>
        </Card>
      </div>

      {/* Filtres */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, description ou établissement…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]"
            />
          </div>

          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setSortBy("upvotes")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                sortBy === "upvotes"
                  ? "bg-[var(--primary-color,#0C1C33)] text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Top votes
            </button>
            <button
              type="button"
              onClick={() => setSortBy("recent")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                sortBy === "recent"
                  ? "bg-[var(--primary-color,#0C1C33)] text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30"
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Récentes
            </button>
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={filterClass}>
            <option value="all">Tous les statuts</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{FEATURE_REQUEST_STATUSES[s].label}</option>
            ))}
          </select>

          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)} className={filterClass}>
            <option value="all">Toutes les catégories</option>
            {(Object.keys(FEATURE_REQUEST_CATEGORIES) as FeatureRequest["category"][]).map((c) => (
              <option key={c} value={c}>{FEATURE_REQUEST_CATEGORIES[c].label}</option>
            ))}
          </select>

          <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)} className={filterClass}>
            <option value="all">Visibilité : tout</option>
            <option value="shown">Affichées</option>
            <option value="hidden">Masquées</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
        </div>
      ) : filteredIdeas.length === 0 ? (
        <Card className="p-16 text-center">
          <Lightbulb className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune suggestion</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {ideas.length === 0
              ? "Aucune suggestion soumise pour le moment."
              : "Aucune suggestion ne correspond à ces critères."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIdeas.map((idea) => {
            const CategoryIcon = FEATURE_REQUEST_CATEGORIES[idea.category]?.icon;
            const ImpactIcon = FEATURE_REQUEST_IMPACTS[idea.impact]?.icon;
            const status = FEATURE_REQUEST_STATUSES[idea.status] || FEATURE_REQUEST_STATUSES.under_review;
            const busy = actioningId === idea.id;

            return (
              <Card key={idea.id} className={`p-4 ${idea.hidden ? "opacity-60" : ""}`}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {idea.hidden && (
                        <Badge variant="error">
                          <EyeOff className="w-3 h-3" /> Masquée
                        </Badge>
                      )}
                      {CategoryIcon && (
                        <Badge variant="outline" className="gap-1">
                          <CategoryIcon className="w-3 h-3" />
                          {FEATURE_REQUEST_CATEGORIES[idea.category]?.label || idea.category}
                        </Badge>
                      )}
                      {ImpactIcon && (
                        <Badge variant="outline" className="gap-1">
                          <ImpactIcon className="w-3 h-3" />
                          {FEATURE_REQUEST_IMPACTS[idea.impact]?.label || idea.impact}
                        </Badge>
                      )}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-2">{idea.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap line-clamp-3">{idea.description}</p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" /> {idea.upvotes} vote{idea.upvotes > 1 ? "s" : ""}
                      </span>
                      <span>Établissement : {idea.tenant_name || "—"}</span>
                      <span>Auteur : {idea.creator?.full_name || "—"}</span>
                      <span>Soumise le {formatDate(idea.created_at)}</span>
                    </div>

                    {idea.screenshot_url && (
                      <a
                        href={idea.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium text-[var(--primary-color,#0C1C33)] hover:underline"
                      >
                        Voir la capture d&apos;écran
                      </a>
                    )}
                  </div>

                  <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 shrink-0">
                    <select
                      value={idea.status}
                      disabled={busy}
                      onChange={(e) => updateStatus(idea, e.target.value as FeatureRequestStatus)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)] disabled:opacity-50"
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{FEATURE_REQUEST_STATUSES[s].label}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant={idea.hidden ? "outline" : "secondary"}
                      onClick={() => toggleHidden(idea)}
                      disabled={busy}
                      className="shrink-0"
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : idea.hidden ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                      {idea.hidden ? "Réafficher" : "Masquer"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5">
        <Shield className="w-3 h-3" /> Zone réservée au Super Admin. Les suggestions masquées ne sont plus visibles des clients mais restent archivées ici.
      </p>
    </div>
  );
}
