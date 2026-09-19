import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/apiClient';
import { 
  ShieldAlert, 
  Camera, 
  Lock, 
  BarChart3, 
  Server, 
  Zap, 
  CheckCircle2, 
  XCircle,
  RefreshCw, 
  Play, 
  Activity, 
  Sliders, 
  Flame,
  Globe
} from 'lucide-react';

type ActionMessage = { type: 'success' | 'error' | 'info'; message: string };

export default function TopFiveFeaturesBar() {
  const [raidPrediction, setRaidPrediction] = useState({
    predictedRaidProbability: 0,
    riskLevel: 'UNKNOWN',
    timeToImpactSeconds: 0,
    recommendation: 'Awaiting scan...'
  });

  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [oauthStatus, setOauthStatus] = useState<any>(null);
  const [shardingStatus, setShardingStatus] = useState<any>(null);
  const [securityStats, setSecurityStats] = useState<{ blockedAttacksCount: number } | null>(null);
  const [engineStatus, setEngineStatus] = useState<{ mode: string; status: string } | null>(null);
  const [isScanningOAuth, setIsScanningOAuth] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);

  const fetchTopStats = async () => {
    try {
      // 1. Raid Prediction (statistical/heuristic model, not ML)
      const resRaid = await apiFetch('/api/security/ai-raid-prediction');
      if (resRaid.ok) {
        const dataRaid = await resRaid.json();
        setRaidPrediction(dataRaid);
      }

      // 2. Snapshots
      const resSnap = await apiFetch('/api/snapshots');
      if (resSnap.ok) {
        const dataSnap = await resSnap.json();
        setSnapshots(dataSnap.snapshots || []);
      }

      // 3. Sharding
      const resShard = await apiFetch('/api/enterprise/status');
      if (resShard.ok) {
        const dataShard = await resShard.json();
        setShardingStatus(dataShard);
      }

      // 4. Security Stats
      const resSec = await apiFetch('/api/security/ultra-stats');
      if (resSec.ok) {
        const dataSec = await resSec.json();
        setSecurityStats({ blockedAttacksCount: dataSec.blockedAttacksCount || 0 });
      }

      // 5. Engine status
      const resEngine = await apiFetch('/api/cpp-engine/stats');
      if (resEngine.ok) {
        const dataEngine = await resEngine.json();
        setEngineStatus({ mode: dataEngine.engineMode || 'sync', status: dataEngine.status || 'OFFLINE' });
      }
    } catch (e) {
      // Fail silently for background polls
    }
  };

  useEffect(() => {
    fetchTopStats();
    const interval = setInterval(fetchTopStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      const res = await apiFetch('/api/snapshots/create', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', message: '📸 New 1-Click Server Snapshot created successfully!' });
        fetchTopStats();
      } else {
        setActionMessage({ type: 'error', message: data.error || 'Failed to create snapshot.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', message: 'Failed to create snapshot.' });
    } finally {
      setIsCreatingSnapshot(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleRestoreLatestSnapshot = async () => {
    try {
      const res = await apiFetch('/api/snapshots/restore', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: snapshots[0]?.id || 'latest' })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', message: '✅ Server restored to clean snapshot state!' });
      } else {
        setActionMessage({ type: 'error', message: data.error || 'Restore failed.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', message: 'Restore failed.' });
    } finally {
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleScanOAuth = async () => {
    setIsScanningOAuth(true);
    try {
      const res = await apiFetch('/api/security/oauth-scan', { method: 'POST' });
      const data = await res.json();
      setOauthStatus(data);
      if (!res.ok || data.success === false) {
        setActionMessage({ type: 'error', message: data.error || 'OAuth scan failed.' });
      } else if (data.threatsFound || data.maliciousCount > 0) {
        const count = data.threatsFound ?? data.maliciousCount ?? 0;
        setActionMessage({ type: 'error', message: `🔐 OAuth Audit Complete: ${count} Malicious Integration(s) Found.` });
      } else {
        setActionMessage({ type: 'success', message: '🔐 OAuth Audit Complete: No Malicious Integrations Found.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', message: 'OAuth scan failed.' });
    } finally {
      setIsScanningOAuth(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleHotRestart = async () => {
    try {
      const res = await apiFetch('/api/enterprise/zero-downtime-restart', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', message: '🔄 Cluster workers reloaded with Zero Downtime!' });
      } else {
        setActionMessage({ type: 'error', message: data.error || 'Hot restart failed.' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', message: 'Hot restart failed.' });
    } finally {
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const engineLabel = engineStatus
    ? engineStatus.mode === 'native'
      ? '⚡ C++ Native Engine Active'
      : engineStatus.mode === 'worker'
        ? 'Worker Engine Active'
        : 'Sync Fallback Engine'
    : 'Engine Status Unavailable';

  const engineBadgeColor = engineStatus
    ? engineStatus.mode === 'native'
      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
      : engineStatus.mode === 'worker'
        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';

  return (
    <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4 mb-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
          <h3 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-2">
            Top 5 Flagship Security Engine Highlights
            <span className={`text-[10px] px-2 py-0.5 rounded-full normal-case font-bold flex items-center gap-1 border ${engineBadgeColor}`}>
              {engineLabel}
            </span>
          </h3>
        </div>
        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full uppercase">
          {engineStatus ? 'Engine Status Loaded' : 'Loading Engine Status...'}
        </span>
      </div>

      {actionMessage && (
        <div className={`p-3 rounded-xl flex items-center justify-between animate-fade-in ${
          actionMessage.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            : actionMessage.type === 'error'
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              : 'bg-zinc-500/10 border border-zinc-500/30 text-zinc-300'
        }`}>
          <span className="text-xs font-bold">{actionMessage.message}</span>
          {actionMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {actionMessage.type === 'error' && <XCircle className="w-4 h-4 text-rose-400" />}
          {actionMessage.type === 'info' && <Activity className="w-4 h-4 text-zinc-400" />}
        </div>
      )}

      {/* 5 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        
        {/* 1. Statistical Raid Prediction */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-indigo-400 uppercase flex items-center gap-1">
                 🧠 1. Statistical Raid Prediction
              </span>
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                raidPrediction.riskLevel === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {raidPrediction.riskLevel}
              </span>
            </div>
            <div className="text-xl font-black text-white mb-1">
              {raidPrediction.predictedRaidProbability}% <span className="text-xs font-normal text-zinc-400">Risk Prob</span>
            </div>
            <p className="text-[10px] text-zinc-400 line-clamp-2">
              {raidPrediction.recommendation}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400">
            <span>Buffer: {raidPrediction.timeToImpactSeconds}s</span>
            <span className="text-indigo-400 font-bold">15s Warning</span>
          </div>
        </div>

        {/* 2. One-click Server Snapshot & Restore */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-emerald-400 uppercase flex items-center gap-1">
                📸 2. Snapshot & Restore
              </span>
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                snapshots.length > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 bg-zinc-500/10'
              }`}>
                {snapshots.length > 0 ? `${snapshots.length} Saved` : 'No Snapshot'}
              </span>
            </div>
            <div className="text-xs font-bold text-zinc-200 mb-2">
              Instant 1-Click Server Recovery
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCreateSnapshot}
                disabled={isCreatingSnapshot}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all"
              >
                {isCreatingSnapshot ? 'Saving...' : '📸 Snapshot'}
              </button>
              <button
                onClick={handleRestoreLatestSnapshot}
                disabled={snapshots.length === 0}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold py-1.5 rounded-lg border border-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ⚡ Restore
              </button>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-400 flex items-center justify-between">
            <span>Channels & Roles Saved</span>
            <span className={`font-bold ${snapshots.length > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {snapshots.length > 0 ? 'Protected' : 'Unavailable'}
            </span>
          </div>
        </div>

        {/* 3. OAuth Malicious App Detector */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-amber-400 uppercase flex items-center gap-1">
                🔐 3. OAuth Detector
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                oauthStatus?.threatsFound ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              }`}>
                {oauthStatus?.threatsFound ? 'Threats Found' : oauthStatus ? 'Clean' : 'Not Scanned'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mb-2">
              Scans for rogue bot integrations, token grabbers & permissions.
            </p>
            <button
              onClick={handleScanOAuth}
              disabled={isScanningOAuth}
              className="w-full bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold py-1.5 rounded-lg transition-all"
            >
              {isScanningOAuth ? 'Auditing Integrations...' : '🔍 Scan Integrations'}
            </button>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-400 flex items-center justify-between">
            <span>OAuth Guard</span>
            <span className="text-amber-400 font-bold">{oauthStatus ? 'Scanned' : 'Ready'}</span>
          </div>
        </div>

        {/* 4. Live Security Analytics Dashboard */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-cyan-400 uppercase flex items-center gap-1">
                📊 4. Security Analytics
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                securityStats ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30'
              }`}>
                {securityStats ? 'Loaded' : 'Unavailable'}
              </span>
            </div>
            <div className="text-xl font-black text-white mb-1">
              {securityStats?.blockedAttacksCount ?? '—'} <span className="text-xs font-normal text-zinc-400">Threats Blocked</span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Real-time attack timeline, join heatmap & threat intelligence feed.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-400 flex items-center justify-between">
            <span>Audit Stream</span>
            <span className="text-cyan-400 font-bold">{shardingStatus?.shards?.[0]?.ping != null ? `${shardingStatus.shards[0].ping}ms` : 'N/A'}</span>
          </div>
        </div>

        {/* 5. Cluster / Sharding Support */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-purple-400 uppercase flex items-center gap-1">
                🌍 5. Cluster & Sharding
              </span>
               <span className="text-[9px] font-bold text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded">
                  {shardingStatus?.gatewayCount != null ? `${shardingStatus.gatewayCount} Gateway${shardingStatus.gatewayCount !== 1 ? 's' : ''}` : 'N/A'}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mb-2">
                Single-instance deployment with automatic restart on failure.
              </p>
             <button
               onClick={handleHotRestart}
               className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[10px] font-bold py-1.5 rounded-lg transition-all"
             >
                🔄 HTTP-Preserving Gateway Restart
             </button>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-400 flex items-center justify-between">
            <span>Ping: {shardingStatus?.gateways?.[0]?.ping != null ? `${shardingStatus.gateways[0].ping}ms` : 'N/A'}</span>
            <span className="text-purple-400 font-bold">
              {shardingStatus?.gateways?.[0]?.uptimeMinutes ? `${Math.round(shardingStatus.gateways[0].uptimeMinutes / 60 * 100) / 100}h uptime` : 'Uptime monitoring'}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
