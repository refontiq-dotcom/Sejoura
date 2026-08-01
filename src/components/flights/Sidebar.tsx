"use client";

import { 
  LayoutDashboard, 
  Plane, 
  Wallet, 
  FileText, 
  BarChart2, 
  Settings, 
  Map as MapIcon 
} from "lucide-react";
import Image from "next/image";

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Flights", icon: Plane },
  { name: "Wallet", icon: Wallet },
  { name: "Reports", icon: FileText, active: true },
  { name: "Statistics", icon: BarChart2 },
  { name: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-[260px] bg-[#0A1A2F] text-white flex flex-col h-full z-10 relative">
      {/* Profile Section */}
      <div className="flex flex-col items-center pt-10 pb-8">
        <div className="w-20 h-20 rounded-full border-2 border-white/20 overflow-hidden mb-3">
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex"
            alt="Alex Johnson"
            className="w-full h-full object-cover bg-white"
          />
        </div>
        <h2 className="font-semibold text-lg tracking-wide">ALEX JOHNSON</h2>
        <p className="text-sm text-slate-400 font-light">alex.johnson@gmail.com</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 w-full pl-6 flex flex-col gap-2 relative">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;

          return (
            <div
              key={item.name}
              className={`relative flex items-center group cursor-pointer w-full pl-6 py-4 rounded-l-3xl transition-colors ${
                isActive ? "bg-[#00BFA6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className={`w-5 h-5 mr-4 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
              <span className="font-medium tracking-wide uppercase text-sm">{item.name}</span>

              {/* The Flow / Bridge extensions for active item */}
              {isActive && (
                <>
                  {/* Top inner curve */}
                  <div className="absolute top-[-1.5rem] right-0 w-6 h-6 bg-transparent rounded-br-3xl shadow-[0.5rem_0.5rem_0_0.5rem_#00BFA6]"></div>
                  {/* Bottom inner curve */}
                  <div className="absolute bottom-[-1.5rem] right-0 w-6 h-6 bg-transparent rounded-tr-3xl shadow-[0.5rem_-0.5rem_0_0.5rem_#00BFA6]"></div>
                  {/* The Bridge stretching to the right (padding gap) */}
                  <div className="absolute top-0 -right-8 w-8 h-full bg-[#00BFA6]"></div>
                </>
              )}
            </div>
          );
        })}
      </nav>

      {/* Active Users & Map Section */}
      <div className="mt-auto px-6 pb-8">
        <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-wider mb-4">Active Users</h3>
        <div className="flex -space-x-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-10 h-10 rounded-full border-2 border-[#0A1A2F] overflow-hidden bg-slate-200">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt={`User ${i}`} />
            </div>
          ))}
          <div className="w-10 h-10 rounded-full border-2 border-[#0A1A2F] bg-[#00BFA6] flex items-center justify-center text-xs font-bold z-10">
            +70
          </div>
        </div>
        <div className="w-full h-32 bg-slate-800/30 rounded-2xl relative overflow-hidden flex items-center justify-center">
           <MapIcon className="w-20 h-20 text-slate-600/50 absolute" />
        </div>
      </div>
    </aside>
  );
}
