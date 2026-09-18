import React, { useState } from 'react';
import { 
  Coins, 
  Sparkles, 
  Trophy, 
  ShoppingBag, 
  ArrowUpRight, 
  ChevronRight, 
  TrendingUp, 
  AlertCircle,
  Gift,
  PlusCircle,
  PiggyBank
} from 'lucide-react';
import { LeaderboardUser } from '../types';
import { apiFetch } from '../services/apiClient';

interface EconomyTabProps {
  leaderboard: LeaderboardUser[];
  onAddLog: (action: string, severity?: 'low' | 'medium' | 'high') => void;
}

export default function EconomyTab({ leaderboard, onAddLog }: EconomyTabProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<LeaderboardUser[]>(leaderboard);

  const shopItems = [
    { id: 'role_vip', name: 'VIP Premium Role', price: 200, type: 'Role reward' },
    { id: 'role_helper', name: 'Assistant Mod Role', price: 500, type: 'Staff permission' },
    { id: 'custom_badge', name: 'Custom Server Badge', price: 150, type: 'Profile asset' }
  ];

  React.useEffect(() => {
    let mounted = true;
    const fetchLeaderboard = async () => {
      try {
        const res = await apiFetch('/api/economy/leaderboard');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.leaderboard) {
            setUsers(data.leaderboard);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch leaderboard:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchLeaderboard();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-6" id="economy-tab-container">
      {/* Economy Status */}
      <div className="bg-[#121212] rounded-xl p-5 border border-zinc-800/80 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Guild Economy</h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Economy system is not configured. No persistent economy database is attached. Leaderboard data is unavailable until a backend economy service is enabled.
        </p>
      </div>

      {/* Leaderboards */}
      <div className="bg-[#121212] rounded-xl p-5 border border-zinc-800/80 shadow-xs" id="leaderboards-panel">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Leaderboard</h3>
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8 text-xs text-zinc-400 font-bold">Loading leaderboard data...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">No leaderboard data available.</div>
          ) : (
            users
              .sort((a, b) => b.xp - a.xp)
              .map((user, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3 rounded-xl border bg-[#18181b]/50 border-zinc-800/40"
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                      idx === 0 ? 'bg-amber-500 text-white' :
                      idx === 1 ? 'bg-zinc-300 text-zinc-200' :
                      idx === 2 ? 'bg-amber-600 text-white' : 'text-zinc-500 bg-[#27272a]'
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <span className="text-xs font-black text-zinc-100">{user.username}</span>
                      <span className="text-[10px] text-zinc-400 block font-bold uppercase">Rank {idx + 1}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 text-xs font-bold text-zinc-700">
                    <div className="text-right">
                      <span className="text-zinc-400 block text-[9px] uppercase font-extrabold tracking-wider">XP</span>
                      <span>{user.xp.toLocaleString()}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-zinc-400 block text-[9px] uppercase font-extrabold tracking-wider">Coins</span>
                      <span className="text-amber-600">🪙 {user.coins.toLocaleString()}</span>
                    </div>

                    <div className="bg-[#121212] border border-zinc-800 rounded-lg px-2.5 py-1 text-center font-black">
                      Lvl {user.level}
                    </div>
                  </div>
                </div>
              )))}
        </div>
      </div>
    </div>
  );
}
