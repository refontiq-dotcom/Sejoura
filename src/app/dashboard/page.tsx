"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Wallet,
  LogIn,
  LogOut,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  formatFCFA,
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getRoomStatusLabel,
  getRoomStatusChartColor,
} from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface KPIData {
  occupancyRate: number;
  dailyRevenue: number;
  expectedCheckins: number;
  expectedCheckouts: number;
  cleaningPending: number;
  cleaningDone: number;
}

interface Movement {
  id: string;
  bookingCode: string;
  clientName: string;
  roomNumber: string;
  roomType: string;
  time: string;
  movementType: "check_in" | "check_out";
  paymentStatus: string;
  totalAmount: number;
  amountPaid: number;
  bookingStatus: string;
}

interface RoomStatusData {
  status: string;
  count: number;
}

interface MonthlyRevenueData {
  month: string;
  revenue: number;
}

// ============================================================================
// DONUT CHART (SVG natif, sans dépendance externe)
// ============================================================================

function DonutChart({ data }: { data: RoomStatusData[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0) || 1;
  const radius = 70;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <svg width="200" height="200" viewBox="0 0 200 200" className="transform -rotate-90">
          {/* Cercle de fond */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-700"
          />
          {/* Segments */}
          {data.map((item, index) => {
            const percentage = item.count / total;
            const dashLength = percentage * circumference;
            const circle = (
              <circle
                key={index}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={getRoomStatusChartColor(item.status)}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            );
            offset += dashLength;
            return circle;
          })}
        </svg>
        {/* Centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">Chambres</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LINE CHART (SVG natif)
// ============================================================================

function LineChart({ data }: { data: MonthlyRevenueData[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
        Aucune donnée disponible
      </div>
    );
  }

  const width = 800;
  const height = 250;
  const padding = { top: 20, right: 20, bottom: 40, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const minRevenue = 0;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.revenue - minRevenue) / (maxRevenue - minRevenue)) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  // Lignes de grille
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padding.top + chartHeight - t * chartHeight;
    const value = Math.round(t * maxRevenue);
    return { y, value };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grille horizontale */}
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={line.y}
              x2={width - padding.right}
              y2={line.y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-slate-200 dark:text-slate-700"
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              textAnchor="end"
              className="text-xs fill-slate-400"
            >
              {formatFCFA(line.value).replace(" FCFA", "")}
            </text>
          </g>
        ))}

        {/* Aire */}
        <path d={areaD} fill="url(#revenueGradient)" />

        {/* Ligne */}
        <path
          d={pathD}
          fill="none"
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="5"
              fill="#6366f1"
              stroke="white"
              strokeWidth="2"
              className="dark:stroke-slate-800"
            />
            <text
              x={p.x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="text-xs fill-slate-500 dark:fill-slate-400"
            >
              {p.month}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData>({
    occupancyRate: 0,
    dailyRevenue: 0,
    expectedCheckins: 0,
    expectedCheckouts: 0,
    cleaningPending: 0,
    cleaningDone: 0,
  });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [roomStatusData, setRoomStatusData] = useState<RoomStatusData[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenueData[]>([]);

  useEffect(() => {
    // Données simulées pour la démonstration
    // (Sera remplacé par les vraies requêtes Supabase quand la BDD sera connectée)
    setTimeout(() => {
      setKpis({
        occupancyRate: 72,
        dailyRevenue: 185000,
        expectedCheckins: 8,
        expectedCheckouts: 5,
        cleaningPending: 6,
        cleaningDone: 12,
      });

      setMovements([
        {
          id: "1",
          bookingCode: "SJ-2024-0042",
          clientName: "Kouassi N'Guessan",
          roomNumber: "101",
          roomType: "Standard",
          time: "14:00",
          movementType: "check_in",
          paymentStatus: "paid",
          totalAmount: 30000,
          amountPaid: 30000,
          bookingStatus: "confirmed",
        },
        {
          id: "2",
          bookingCode: "SJ-2024-0038",
          clientName: "Aminata Traoré",
          roomNumber: "204",
          roomType: "Deluxe",
          time: "11:00",
          movementType: "check_out",
          paymentStatus: "partial",
          totalAmount: 70000,
          amountPaid: 40000,
          bookingStatus: "checked_in",
        },
        {
          id: "3",
          bookingCode: "SJ-2024-0043",
          clientName: "Jean-Marc Aka",
          roomNumber: "302",
          roomType: "Suite",
          time: "15:30",
          movementType: "check_in",
          paymentStatus: "unpaid",
          totalAmount: 90000,
          amountPaid: 0,
          bookingStatus: "confirmed",
        },
        {
          id: "4",
          bookingCode: "SJ-2024-0035",
          clientName: "Fatou Diabaté",
          roomNumber: "105",
          roomType: "Standard",
          time: "10:00",
          movementType: "check_out",
          paymentStatus: "paid",
          totalAmount: 45000,
          amountPaid: 45000,
          bookingStatus: "checked_in",
        },
        {
          id: "5",
          bookingCode: "SJ-2024-0044",
          clientName: "Ibrahim Koné",
          roomNumber: "201",
          roomType: "Deluxe",
          time: "16:00",
          movementType: "check_in",
          paymentStatus: "partial",
          totalAmount: 60000,
          amountPaid: 30000,
          bookingStatus: "confirmed",
        },
      ]);

      setRoomStatusData([
        { status: "occupied", count: 18 },
        { status: "available", count: 7 },
        { status: "cleaning", count: 4 },
        { status: "alert", count: 1 },
      ]);

      setMonthlyRevenue([
        { month: "Fév", revenue: 1200000 },
        { month: "Mar", revenue: 1450000 },
        { month: "Avr", revenue: 1320000 },
        { month: "Mai", revenue: 1680000 },
        { month: "Juin", revenue: 1520000 },
        { month: "Juil", revenue: 1850000 },
      ]);

      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. BARRE DE CARTES SPÉCIALES — 4 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Taux d'occupation */}
        <Card className="p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <Badge variant="info">Aujourd'hui</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Taux d'occupation</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{kpis.occupancyRate}%</p>
          <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
              style={{ width: `${kpis.occupancyRate}%` }}
            />
          </div>
        </Card>

        {/* KPI 2: Encaissements du jour */}
        <Card className="p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <Badge variant="success">FCFA</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Encaissements du jour</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {formatFCFA(kpis.dailyRevenue).replace(" FCFA", "")}
          </p>
          <p className="text-xs text-slate-400 mt-2">FCFA encaissés aujourd'hui</p>
        </Card>

        {/* KPI 3: Entrées / Sorties prévues */}
        <Card className="p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Entrées / Sorties</p>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <LogIn className="w-4 h-4 text-green-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.expectedCheckins}</span>
              </div>
              <p className="text-xs text-slate-400">Arrivées</p>
            </div>
            <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />
            <div>
              <div className="flex items-center gap-1.5">
                <LogOut className="w-4 h-4 text-orange-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.expectedCheckouts}</span>
              </div>
              <p className="text-xs text-slate-400">Départs</p>
            </div>
          </div>
        </Card>

        {/* KPI 4: État Ménage */}
        <Card className="p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">État du ménage</p>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.cleaningPending}</span>
              </div>
              <p className="text-xs text-slate-400">À nettoyer</p>
            </div>
            <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />
            <div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.cleaningDone}</span>
              </div>
              <p className="text-xs text-slate-400">Prêtes</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 2. CONTENEUR PRINCIPAL GAUCHE (70%) + 3. CONTENEUR SECONDAIRE DROITE (30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Tableau des mouvements du jour (70%) */}
        <Card className="lg:col-span-7 overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Mouvements du jour
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Arrivées et départs prévus aujourd'hui
              </p>
            </div>
            <Button variant="outline" size="sm">
              Voir tout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Logement
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Heure
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Paiement
                  </th>
                  <th className="text-right p-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {movements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                          {m.clientName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {m.clientName}
                          </p>
                          <p className="text-xs text-slate-400">{m.bookingCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Ch. {m.roomNumber}
                      </p>
                      <p className="text-xs text-slate-400">{m.roomType}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {m.movementType === "check_in" ? (
                          <LogIn className="w-4 h-4 text-green-500" />
                        ) : (
                          <LogOut className="w-4 h-4 text-orange-500" />
                        )}
                        <span className="text-sm text-slate-700 dark:text-slate-300">{m.time}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(m.paymentStatus)}`}
                        >
                          {getPaymentStatusLabel(m.paymentStatus)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatFCFA(m.amountPaid)} / {formatFCFA(m.totalAmount)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant={m.movementType === "check_in" ? "primary" : "secondary"}
                        size="sm"
                      >
                        {m.movementType === "check_in" ? "Check-in" : "Check-out"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Donut Chart — État du parc (30%) */}
        <Card className="lg:col-span-3 p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            État du parc
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Répartition en temps réel
          </p>

          <DonutChart data={roomStatusData} />

          {/* Légende */}
          <div className="mt-6 space-y-2.5">
            {roomStatusData.map((item) => (
              <div key={item.status} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getRoomStatusChartColor(item.status) }}
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {getRoomStatusLabel(item.status)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 4. CONTENEUR INFÉRIEUR — Graphique linéaire des recettes */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Suivi des recettes mensuelles
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Évolution des encaissements (en FCFA)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20">
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                +21.7%
              </span>
            </div>
          </div>
        </div>

        <LineChart data={monthlyRevenue} />
      </Card>
    </div>
  );
}