import { StatCard } from "@/components/flights/StatCard";
import { LastTrips } from "@/components/flights/LastTrips";
import { StatisticsChart, FlightsShareChart, FlightsScheduleChart } from "@/components/flights/Charts";

export default function FlightsDashboard() {
  return (
    <div className="p-8 w-full max-w-7xl">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Detailed overview of your flights</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-10 pr-4 py-2 rounded-full border border-[var(--border)] bg-[var(--card-bg,var(--surface))] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button className="w-10 h-10 rounded-full bg-[var(--card-bg,var(--surface))] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <div className="h-40">
          <StatCard title="Boeing 787" value="$548" type="green" />
        </div>
        <div className="h-40">
          <StatCard title="Airbus 811" value="$620" type="blue" />
        </div>
        <div className="h-40">
          <StatCard title="Total Flights" value="850" type="dark" />
        </div>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* The -ml-8 is critical here: it offsets the padding to connect with the sidebar bridge */}
        <div className="lg:col-span-8 -ml-8 pl-8 relative z-0">
           {/* We add an inner wrapper to apply the border radius tweaks so it merges perfectly */}
           <div className="h-[400px] w-full [&>div]:rounded-l-none [&>div]:border-l-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] rounded-r-3xl bg-[var(--card-bg,var(--surface))]">
             <LastTrips />
           </div>
        </div>
        <div className="lg:col-span-4 h-[400px]">
          <StatisticsChart />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-8">
        <div className="lg:col-span-4 h-[350px]">
          <FlightsShareChart />
        </div>
        <div className="lg:col-span-8 h-[350px]">
          <FlightsScheduleChart />
        </div>
      </div>
    </div>
  );
}
