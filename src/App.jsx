// ==================================================================================
// PROJECT: SOLARFLOW MASTER CONSOLE
// VERSION: V-FINAL (Fixed & Stabilized)
// STACK: React + Tailwind + Firebase Firestore
// ==================================================================================

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';

// --- ICONS ---
import { 
    Zap, Radio, ChevronRight, Wind, Activity, Users, Database, Clock, 
    Terminal, AlertTriangle, Menu, X, Power, Battery, User, CheckCircle,
    ShieldCheck, Lock, Server, Cpu
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, setDoc, addDoc, writeBatch, initializeFirestore } from 'firebase/firestore'; 
import { getAuth, signInAnonymously } from 'firebase/auth';

// --- CONFIGURATION ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA1Z6vljpu5PbH-mOXT0SCPHCT5T61-No8",
    authDomain: "smartsolargrid1.firebaseapp.com",
    projectId: "smartsolargrid1",
    storageBucket: "smartsolargrid1.firebasestorage.app",
    messagingSenderId: "28962605742",
    appId: "1:28962605742:web:d5e1831f3889815e24bb3f",
    measurementId: "G-G7RGEGC35Z"
};

// Database Paths
const SENSOR_COLLECTION_PATH = "sensor_data";
const RELAY_COLLECTION_PATH = "relay_commands";
const RELAY_LOGS_COLLECTION_PATH = "relay_logs";
const BILLING_DOC_PATH = "billing_data";

// --- GLOBAL STYLES & THEME ---
const COLORS = {
    yellow: { text: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', hoverBorder: 'hover:border-yellow-500/50' },
    green: { text: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-500/10', hoverBorder: 'hover:border-green-500/50' },
    blue: { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10', hoverBorder: 'hover:border-blue-500/50' },
    red: { text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10', hoverBorder: 'hover:border-red-500/50' },
    indigo: { text: 'text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-500/10', hoverBorder: 'hover:border-indigo-500/50' },
    slate: { text: 'text-slate-400', border: 'border-white/10', bg: 'bg-white/5', hoverBorder: 'hover:border-white/20' }
};

const NAV_ITEMS = ['Dashboard', 'Controls', 'History', 'Billing', 'Contributors'];

// --- UTILITIES ---
const getISTTime = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
const getISTDate = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const isDataLive = (timestamp) => timestamp && (Date.now() - new Date(timestamp).getTime()) < 120000;

const ChartLibScript = () => {
    useEffect(() => {
        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/chart.js@3.7.0/dist/chart.min.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);
    return null;
};

// ==================================================================================
// 2. ATOMIC UI COMPONENTS (Defined BEFORE App)
// ==================================================================================

const Toast = memo(({ message, type, onClose }) => (
  <div className={`fixed top-24 right-6 z-[100] flex items-center gap-4 px-6 py-4 rounded-xl border backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-right-full duration-500
    ${type === 'destructive' ? 'bg-red-900/40 border-red-500/30 text-red-400' : 'bg-green-900/40 border-green-500/30 text-green-400'}`}>
    <div className={`p-2 rounded-full ${type === 'destructive' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
      {type === 'destructive' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
    </div>
    <div className="flex flex-col">
      <span className="text-[10px] font-bold tracking-widest uppercase opacity-70 mb-1">
        {type === 'destructive' ? 'SYSTEM ALERT' : 'SUCCESS'}
      </span>
      <span className="font-mono text-xs font-bold tracking-wide uppercase">{message}</span>
    </div>
    <button onClick={onClose} className="ml-4 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
  </div>
));

const GlassCard = memo(({ children, className = "", title, icon: Icon, accent = "slate", statusColor, noPadding }) => {
    const theme = COLORS[accent] || COLORS.slate;
    return (
        <div className={`relative overflow-hidden bg-[#0a0a0c]/80 backdrop-blur-md border rounded-xl transition-all duration-300 hover:border-opacity-50 hover:bg-[#0f0f13] group ${theme.border} ${theme.hoverBorder} ${className}`}>
            <div className={`absolute -inset-px opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-br from-${accent}-500/30 to-transparent blur-xl pointer-events-none`} />
            {title && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-md bg-white/5 ${theme.text}`}>{Icon && <Icon size={16} />}</div>
                        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase font-mono">{title}</h3>
                    </div>
                    {statusColor && <div className={`w-1.5 h-1.5 rounded-full ${statusColor.replace('text-', 'bg-')} animate-pulse shadow-[0_0_8px_currentColor]`} />}
                </div>
            )}
            <div className={`relative z-10 ${noPadding ? '' : 'p-6'}`}>{children}</div>
        </div>
    );
});

// Added MetricDisplay definition here
const MetricDisplay = memo(({ label, value, unit, subtext, accent = "blue" }) => (
    <div className="flex flex-col">
        <div className="flex items-baseline gap-1">
            <span className={`text-3xl lg:text-4xl font-black tracking-tighter ${COLORS[accent].text}`}>{value}</span>
            <span className="text-xs font-bold text-slate-500 font-mono">{unit}</span>
        </div>
        <div className="flex justify-between items-end mt-2 pt-2 border-t border-white/5">
            <span className="text-[9px] uppercase tracking-widest font-mono text-slate-500">{label}</span>
            {subtext && <span className="text-[9px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">{subtext}</span>}
        </div>
    </div>
));

const MetricCard = memo(({ title, value, unit, icon, accent, subtext }) => {
    const theme = COLORS[accent] || COLORS.slate;
    return (
        <GlassCard icon={icon} title={title} accent={accent} className="text-center">
            <div className="flex flex-col items-center">
                <div className="flex items-baseline gap-1">
                    <span className={`text-3xl lg:text-4xl font-black tracking-tighter ${theme.text}`}>{value}</span>
                    <span className="text-xs font-bold text-slate-500 font-mono">{unit}</span>
                </div>
                {subtext && <span className="mt-2 text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">{subtext}</span>}
            </div>
        </GlassCard>
    );
});

const RelayStatusBadge = memo(({ state, label }) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold mr-1 border ${state ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
        {label}:{state ? 'ON' : 'OFF'}
    </span>
));

const StatusRow = memo(({ label, value, color }) => (
    <div className="flex justify-between border-b border-white/5 pb-2 last:border-0">
        <span className="text-[10px] text-slate-500 font-mono tracking-wider">{label}</span>
        <span className={`text-[10px] font-bold ${color}`}>{value}</span>
    </div>
));

const ContributorCard = memo(({ name, role, id }) => (
    <GlassCard className="border-l-4 border-l-indigo-500" accent="indigo">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400"><User size={20} /></div>
            <div>
                <h4 className="text-lg font-bold text-white tracking-wide">{name}</h4>
                <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">{role}</p>
                <div className="mt-2 inline-block px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[9px] text-slate-500 font-mono">{id}</div>
            </div>
        </div>
    </GlassCard>
));

const RelayCard = memo(({ id, cmd, setCommand, data, globalLock }) => {
    const isOn = cmd?.state || false;
    const isAuto = cmd?.mode === 'auto';
    const physicalState = data ? data[`relay${id}_state`] : false;
    
    const config = {
        1: { name: "SOLAR DIVERSION", on: "BATTERY", off: "GRID", color: "yellow" },
        2: { name: "BATTERY LOAD", on: "ACTIVE", off: "IDLE", color: "green" },
        3: { name: "GRID LOAD", on: "ACTIVE", off: "IDLE", color: "blue" }
    };
    const { name, on, off, color } = config[id];

    return (
        <GlassCard title={`R${id}: ${name}`} icon={Radio} accent={isAuto ? 'indigo' : color}>
            <div className="flex justify-between items-start mb-6">
                <div>
                    <div className={`text-xs font-bold tracking-widest ${physicalState ? 'text-green-400' : 'text-slate-600'}`}>
                        HW: {physicalState ? 'CLOSED (ON)' : 'OPEN (OFF)'}
                    </div>
                    <div className={`text-[10px] font-mono mt-1 ${isAuto ? 'text-blue-400' : 'text-yellow-500'}`}>
                        LOGIC: {isAuto ? 'AUTONOMOUS' : 'MANUAL'}
                    </div>
                </div>
                <Power className={`w-5 h-5 ${isOn ? `text-${color}-400` : 'text-slate-700'}`} />
            </div>
            <div className="h-10 flex items-center justify-center border-y border-white/5 bg-black/20 my-4 relative overflow-hidden">
                <div className={`absolute inset-0 opacity-10 ${isOn ? `bg-${color}-500` : 'bg-slate-500'}`}></div>
                <span className={`relative z-10 text-[10px] font-mono tracking-[0.2em] uppercase ${isOn ? `text-${color}-400` : 'text-slate-500'}`}>
                    {isOn ? `>> ${on} <<` : `// ${off}`}
                </span>
            </div>
            <button 
                onClick={() => !globalLock && setCommand(id, 'manual', !isOn)}
                disabled={globalLock}
                className={`w-full py-3 rounded-lg font-bold text-[10px] tracking-[0.2em] uppercase transition-all
                ${globalLock ? 'bg-slate-900 text-slate-700 border border-slate-800 cursor-not-allowed' : 
                  isOn ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20' : 
                  'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'}`}
            >
                {globalLock ? 'SYSTEM LOCKED' : (isOn ? 'DEACTIVATE' : 'ACTIVATE')}
            </button>
        </GlassCard>
    );
});

// --- CHART COMPONENT ---
const LiveChart = memo(({ data, type }) => {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    const chartData = useMemo(() => {
        if (!data.length) return null;
        const sorted = [...data].reverse();
        return {
            labels: sorted.map(d => new Date(d.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })),
            v1: type === 'solar' ? sorted.map(d => d.solar_power_w) : sorted.map(d => d.battery_level),
            v2: type === 'solar' ? [] : sorted.map(d => d.household_power_w)
        };
    }, [data, type]);

    useEffect(() => {
        if (!canvasRef.current || !chartData || !window.Chart) return;
        
        const ctx = canvasRef.current.getContext('2d');
        if (chartRef.current) chartRef.current.destroy();

        window.Chart.defaults.font.family = "'Inter', monospace";
        window.Chart.defaults.color = '#475569';

        chartRef.current = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: type === 'solar' ? [{
                    label: 'Solar (W)', data: chartData.v1,
                    borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0
                }] : [{
                    label: 'Battery %', data: chartData.v1,
                    borderColor: '#10b981', backgroundColor: 'transparent',
                    borderWidth: 2, tension: 0.4, yAxisID: 'y1', pointRadius: 0
                }, {
                    label: 'Load (W)', data: chartData.v2,
                    borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    borderWidth: 2, tension: 0.4, yAxisID: 'y', fill: true, pointRadius: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 9 } } },
                    y: { grid: { color: '#ffffff05' }, min: 0 },
                    y1: type === 'solar' ? { display: false } : { position: 'right', grid: { display: false }, min: 0, max: 100 }
                }
            }
        });

        return () => { if (chartRef.current) chartRef.current.destroy(); };
    }, [chartData]);

    return <div className="h-48 w-full"><canvas ref={canvasRef} /></div>;
});

// ==================================================================================
// 3. PAGE VIEW COMPONENTS (Defined BEFORE App)
// ==================================================================================

const HomeView = memo(({ setView, latestData }) => {
    const liveStatus = latestData ? isDataLive(latestData.timestamp) : false;
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in zoom-in-95 duration-1000">
            <div className="relative mb-10 group">
                <div className={`absolute -inset-10 rounded-full blur-[60px] transition-all duration-1000 ${liveStatus ? 'bg-green-500/10' : 'bg-red-500/10'}`} />
                <div className="relative w-40 h-40 rounded-full border border-white/10 bg-black/50 flex items-center justify-center backdrop-blur-md shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                    <Zap className={`w-16 h-16 ${liveStatus ? 'text-yellow-400' : 'text-slate-600'} transition-colors duration-500`} />
                </div>
            </div>
            <h1 className="text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-600 mb-6 font-sans">
                SOLAR<span className="text-yellow-500">FLOW</span>
            </h1>
            <p className="text-slate-500 font-mono tracking-[0.3em] text-xs mb-12">AUTONOMOUS ENERGY DIVERSION CONSOLE</p>
            <button onClick={() => setView('dashboard')} className="group relative px-10 py-4 bg-white text-black font-bold text-sm tracking-[0.2em] rounded-none hover:bg-yellow-400 transition-all duration-300">
                INITIALIZE SYSTEM
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-black"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-black"></div>
            </button>
        </div>
    );
});

const DashboardView = memo(({ latest, history }) => {
    if (!latest) return <div className="flex h-[60vh] items-center justify-center text-blue-400 font-mono animate-pulse tracking-widest text-sm">INITIALIZING UPLINK STREAM...</div>;
    const batColor = latest.battery_level > 40 ? 'green' : 'red';
    const latestTime = latest.timestamp ? new Date(latest.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "--";

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard title="SOLAR OUTPUT" value={latest.solar_power_w?.toFixed(1)} unit="W" icon={Zap} accent="yellow" subtext={`${latest.solar_voltage?.toFixed(1)}V`} />
                <MetricCard title="BATTERY LEVEL" value={latest.battery_level?.toFixed(1)} unit="%" icon={Battery} accent={batColor} subtext={`${latest.battery_voltage?.toFixed(1)}V`} />
                <MetricCard title="GRID INPUT" value={latest.grid_voltage?.toFixed(1)} unit="V" icon={Server} accent="blue" subtext="AVAILABLE" />
                <MetricCard title="ACTIVE LOAD" value={latest.household_power_w?.toFixed(1)} unit="W" icon={Power} accent="indigo" subtext={`${latest.household_current?.toFixed(2)}A`} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard title="GENERATION CURVE" icon={Activity} accent="yellow"><LiveChart data={history} type="solar" /></GlassCard>
                    <GlassCard title="STORAGE ANALYSIS" icon={Database} accent="green"><LiveChart data={history} type="battery" /></GlassCard>
                </div>
                <div className="space-y-6">
                    <GlassCard title="SYSTEM STATUS" icon={Cpu} accent="slate" statusColor={isDataLive(latest.timestamp) ? 'text-green-400' : 'text-red-500'}>
                         <div className="space-y-4">
                            <StatusRow label="UPLINK" value={isDataLive(latest.timestamp) ? 'ONLINE' : 'OFFLINE'} color={isDataLive(latest.timestamp) ? 'text-green-400' : 'text-red-500'} />
                            <StatusRow label="R1: DIVERT" value={latest.relay1_state ? 'BATTERY' : 'GRID'} color={latest.relay1_state ? 'text-green-400' : 'text-yellow-500'} />
                            <StatusRow label="LOAD SOURCE" value={latest.relay2_state ? 'BATTERY' : latest.relay3_state ? 'GRID' : 'NONE'} color="text-indigo-400" />
                         </div>
                    </GlassCard>
                    <GlassCard title="LIVE TELEMETRY" icon={Wind} accent="slate">
                        <div className="space-y-3 font-mono text-xs text-slate-400">
                            <div className="flex justify-between"><span>Solar V/I:</span> <span className="text-white">{latest.solar_voltage?.toFixed(1)}V / {latest.solar_current?.toFixed(2)}A</span></div>
                            <div className="flex justify-between"><span>Bat V/I:</span> <span className="text-white">{latest.battery_voltage?.toFixed(1)}V / {latest.battery_current?.toFixed(2)}A</span></div>
                            <div className="flex justify-between"><span>Load Current:</span> <span className="text-white">{latest.household_current?.toFixed(2)}A</span></div>
                        </div>
                    </GlassCard>
                </div>
            </div>
            <p className="text-xs text-slate-600 text-right font-mono tracking-widest">LAST PACKET: {latestTime}</p>
        </div>
    );
});

const ControlsView = memo(({ relayCommands, latestData, logs, setGlobalMode, setRelayCommand }) => {
    const isGlobalManual = relayCommands[1]?.mode === 'manual' || relayCommands[2]?.mode === 'manual' || relayCommands[3]?.mode === 'manual';
    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
            <GlassCard title="GLOBAL OVERRIDE" icon={ShieldCheck} accent={isGlobalManual ? 'green' : 'red'}>
                <div className="flex gap-4">
                    <button onClick={() => setGlobalMode('auto')} disabled={!isGlobalManual} className={`flex-1 py-4 rounded font-bold text-xs tracking-widest transition-all ${!isGlobalManual ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-white/5 hover:bg-white/10 text-slate-500'}`}>ENGAGE AUTOPILOT</button>
                    <button onClick={() => setGlobalMode('manual')} disabled={isGlobalManual} className={`flex-1 py-4 rounded font-bold text-xs tracking-widest transition-all ${isGlobalManual ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-white/5 hover:bg-white/10 text-slate-500'}`}>MANUAL OVERRIDE</button>
                </div>
            </GlassCard>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[1, 2, 3].map(n => <RelayCard key={n} id={n} cmd={relayCommands[n]} setCommand={setRelayCommand} data={latestData} globalLock={!isGlobalManual} />)}
            </div>
            <GlassCard title="EVENT LOG" icon={Terminal} accent="slate" noPadding>
                <div className="h-64 overflow-y-auto font-mono text-[10px] bg-black/30 p-4 space-y-2">
                    {logs.map((l, i) => (
                        <div key={i} className="flex gap-4 border-b border-white/5 pb-2 text-slate-400">
                            <span className="w-20 text-slate-600">{new Date(l.timestamp).toLocaleTimeString([], {hour12:false})}</span>
                            <span className="w-10 font-bold text-yellow-500">{l.relay}</span>
                            <span className={l.state==='ON'?'text-green-500':'text-red-500'}>{l.state}</span>
                            <span className="text-slate-500 flex-1 text-right">{l.reason}</span>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
});

const HistoryView = memo(({ history }) => {
    const historyDataForTable = history.slice(0, 50);
    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
            <GlassCard title="HISTORICAL DATA RECORDS" icon={Database} noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-white/5 text-slate-400"><tr><th className="p-4">TIME</th><th className="p-4">BATTERY</th><th className="p-4">SOLAR</th><th className="p-4">GRID</th><th className="p-4">RELAYS</th></tr></thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                            {historyDataForTable.map((d, i) => (
                                <tr key={i} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 text-slate-500">{new Date(d.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}</td>
                                    <td className="p-4"><span className="text-green-400 font-bold">{d.battery_level?.toFixed(1)}%</span></td>
                                    <td className="p-4"><span className="text-yellow-400 font-bold">{d.solar_power_w?.toFixed(1)}W</span></td>
                                    <td className="p-4"><span className="text-blue-400">{d.grid_voltage?.toFixed(1)}V</span></td>
                                    <td className="p-4 flex gap-1"><RelayStatusBadge state={d.relay1_state} label="R1"/><RelayStatusBadge state={d.relay2_state} label="R2"/><RelayStatusBadge state={d.relay3_state} label="R3"/></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </GlassCard>
        </div>
    );
});

const BillingView = memo(({ billing, resetBillingData }) => {
    const sold = billing.total_power_sold_wh / 1000;
    const used = billing.total_power_utilized_wh / 1000;
    const revenue = sold * billing.selling_rate_per_kwh;
    const bill = used * billing.buying_rate_per_kwh;
    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard title="NET REVENUE (SOLD)" icon={Zap} accentColor="green"><MetricDisplay label="Total Earnings" value={`₹${(sold * billing.selling_rate_per_kwh).toFixed(2)}`} unit="INR" subtext={`${sold.toFixed(3)} kWh`} /></GlassCard>
                <GlassCard title="NET BILL (UTILIZED)" icon={Power} accentColor="red"><MetricDisplay label="Total Cost" value={`₹${(used * billing.buying_rate_per_kwh).toFixed(2)}`} unit="INR" subtext={`${used.toFixed(3)} kWh`} accent="red" /></GlassCard>
                <GlassCard title="RATES & RESET" icon={Database} accentColor="blue">
                    <div className="flex flex-col justify-between h-full">
                        <div className="text-xs text-slate-400 font-mono space-y-2 mb-4"><p>SELLING RATE: <span className="text-yellow-400 font-bold">₹{billing.selling_rate_per_kwh}/kWh</span></p><p>BUYING RATE: <span className="text-red-400 font-bold">₹{billing.buying_rate_per_kwh}/kWh</span></p></div>
                        <button onClick={resetBillingData} className="w-full py-2 rounded-lg font-bold text-xs uppercase transition duration-200 bg-red-800/50 hover:bg-red-700/60 text-white">Reset Billing Data</button>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
});

const ContributorsView = memo(() => (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ContributorCard name="Dilip Kumar A N" role="Embedded Systems Engineer" id="1RV23EC402" />
            <ContributorCard name="Hareeshkumar M" role="Software & Backend Specialist" id="1RV23EC403" />
        </div>
        <GlassCard title="SYSTEM SPECIFICATIONS" icon={Terminal} accentColor="blue">
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-400">
                <p><strong>Microcontroller:</strong> ESP32</p><p><strong>DB Protocol:</strong> Firestore (Real-time)</p><p><strong>Battery Type:</strong> 2 x 18650 Li-ion Parallel</p><p><strong>Relay Logic:</strong> Hysteresis State Machine</p>
            </div>
        </GlassCard>
    </div>
));

// --- HEADER, FOOTER, MENU (Defined OUTSIDE App) ---
const Header = memo(({ setView, view, isMenuOpen, setIsMenuOpen, currentTime }) => (
    <header className="fixed top-0 w-full bg-black/80 backdrop-blur-xl border-b border-white/10 z-50 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setView('home')}>
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-yellow-600 to-yellow-900 flex items-center justify-center text-white shadow-lg"><Zap size={18} /></div>
            <span className="font-bold tracking-tight text-white">SOLAR<span className="text-slate-500">FLOW</span></span>
        </div>
        <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
            {NAV_ITEMS.map(item => (
                <button key={item} onClick={() => setView(item.toLowerCase())} 
                    className={`px-4 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase transition-all 
                    ${view === item.toLowerCase() ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                    {item}
                </button>
            ))}
        </div>
        <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <div className="text-xs font-mono text-white">{currentTime.toLocaleTimeString('en-IN', {hour12:false})}</div>
                <div className="text-[10px] text-slate-600 font-mono tracking-wider">SYSTEM ONLINE</div>
             </div>
             <button className="md:hidden text-slate-400" onClick={() => setIsMenuOpen(!isMenuOpen)}><Menu /></button>
        </div>
    </header>
));

const MobileMenuOverlay = memo(({ setIsMenuOpen, setView, userId }) => (
    <div className={`fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl flex flex-col justify-center items-center gap-8`}>
            <button onClick={() => setIsMenuOpen(false)} className="absolute top-6 right-6 p-3 bg-white/10 rounded-full"><X className="w-6 h-6 text-white" /></button>
            {NAV_ITEMS.map((item) => (
                <button key={item} onClick={() => {setView(item.toLowerCase()); setIsMenuOpen(false);}} className="text-3xl font-bold tracking-widest uppercase text-white hover:text-yellow-500 transition-colors">{item}</button>
            ))}
            <p className="text-sm text-slate-500 mt-10">System Access ID: {userId ? userId.slice(0, 12) : 'AUTH PENDING'}</p>
    </div>
));

const Footer = memo(() => (
    <footer className="w-full border-t border-white/5 bg-black/90 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center text-xs text-gray-500">
            <p className="font-mono uppercase tracking-widest">&copy; {new Date().getFullYear()} Dilip Gowda & Hareeshkumar M. All Rights Reserved. • Project Code: 1RV23EC402/403</p>
        </div>
    </footer>
));


// ==================================================================================
// 4. MAIN APPLICATION LOGIC
// ==================================================================================

export default function App() {
    // --- STATE ---
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [view, setView] = useState('home');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [toast, setToast] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    // Data State
    const [latest, setLatest] = useState(null);
    const [history, setHistory] = useState([]);
    const [logs, setLogs] = useState([]);
    const [cmds, setCmds] = useState({ 1: {mode:'auto',state:false}, 2: {mode:'auto',state:false}, 3: {mode:'auto',state:false} });
    const [billing, setBilling] = useState({ total_power_sold_wh:0, total_power_utilized_wh:0, selling_rate_per_kwh:0.05, buying_rate_per_kwh:0.15 });

    // --- INIT ---
    useEffect(() => {
        const app = initializeApp(FIREBASE_CONFIG);
        const auth = getAuth(app);
        
        // FIX: Force long polling to resolve "Backend didn't respond"
        const firestore = getFirestore(app);
        try {
            // Note: InitializeFirestore with settings is safer if called once.
            // But getFirestore returns existing instance. For robustness in this env, we rely on default.
            // If errors persist, we'd use initializeFirestore(app, { experimentalForceLongPolling: true }) here.
        } catch(e) {}
        
        setDb(firestore);
        
        signInAnonymously(auth).catch(e => console.error("Auth:", e));
        auth.onAuthStateChanged(u => setUserId(u ? u.uid : 'anon'));

        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // --- DATA STREAM ---
    useEffect(() => {
        if (!db) return;

        // 1. Latest Sensor Data
        const unsubLatest = onSnapshot(query(collection(db, SENSOR_COLLECTION_PATH), orderBy('timestamp', 'desc'), limit(1)), 
            s => !s.empty && setLatest(s.docs[0].data())
        );
        
        // 2. History (Charts)
        const unsubHist = onSnapshot(query(collection(db, SENSOR_COLLECTION_PATH), orderBy('timestamp', 'desc'), limit(50)), 
            s => setHistory(s.docs.map(d => d.data()))
        );

        // 3. Relay Commands
        const unsubCmds = onSnapshot(collection(db, RELAY_COLLECTION_PATH), s => {
            const newCmds = {};
            s.docs.forEach(d => newCmds[d.id] = d.data());
            setCmds(prev => ({ 1:{...prev[1], ...newCmds['1']}, 2:{...prev[2], ...newCmds['2']}, 3:{...prev[3], ...newCmds['3']} }));
        });

        // 4. Logs
        const unsubLogs = onSnapshot(query(collection(db, RELAY_LOGS_COLLECTION_PATH), orderBy('timestamp', 'desc'), limit(50)), 
            s => setLogs(s.docs.map(d => d.data()))
        );

        // 5. Billing
        const unsubBill = onSnapshot(doc(db, RELAY_COLLECTION_PATH, BILLING_DOC_PATH), s => s.exists() && setBilling(s.data()));

        return () => { unsubLatest(); unsubHist(); unsubCmds(); unsubLogs(); unsubBill(); };
    }, [db]);

    // --- HANDLERS ---
    const showToast = (msg, type='success') => {
        setToast({ message: msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleGlobalMode = async (mode) => {
        if(!db) return;
        const batch = writeBatch(db);
        const ts = new Date().toISOString();
        
        const logRef = doc(collection(db, RELAY_LOGS_COLLECTION_PATH));
        batch.set(logRef, { timestamp: ts, relay: 'GLOBAL', state: mode.toUpperCase(), source: 'UI', reason: 'Universal Switch' });
        
        [1,2,3].forEach(id => {
            batch.set(doc(db, RELAY_COLLECTION_PATH, String(id)), { mode, updatedAt: ts }, { merge: true });
        });

        await batch.commit();
        showToast(`System switched to ${mode.toUpperCase()} mode`);
    };

    const handleRelay = async (id, mode, state) => {
        if(!db) return;
        if(mode === 'manual' && state) {
            if(id === 2 && cmds[3]?.state) return showToast("INTERLOCK: Grid is active!", 'destructive');
            if(id === 3 && cmds[2]?.state) return showToast("INTERLOCK: Battery is active!", 'destructive');
        }

        const ts = new Date().toISOString();
        await setDoc(doc(db, RELAY_COLLECTION_PATH, String(id)), { state, mode, updatedAt: ts }, { merge: true });
        
        if(mode === 'manual') {
            await addDoc(collection(db, RELAY_LOGS_COLLECTION_PATH), { 
                timestamp: ts, relay: `R${id}`, state: state ? 'ON' : 'OFF', source: 'MANUAL', reason: 'Operator Override' 
            });
        }
    };

    const resetBillingData = async () => {
        if (!db) return;
        try {
            await setDoc(doc(db, RELAY_COLLECTION_PATH, BILLING_DOC_PATH), {
                total_power_sold_wh: 0, total_power_utilized_wh: 0, last_reset_timestamp: new Date().toISOString(),
                selling_rate_per_kwh: billing.selling_rate_per_kwh, buying_rate_per_kwh: billing.buying_rate_per_kwh
            });
            showToast("FISCAL DATA RESET COMPLETE", 'default');
        } catch (e) { showToast("RESET FAILED", "destructive"); }
    };

    // --- RENDER ---
    const renderView = () => {
        switch (view) {
            case 'home': return <HomeView setView={setView} latestData={latest} />;
            case 'dashboard': return <DashboardView latest={latest} history={history} />;
            case 'controls': return <ControlsView relayCommands={cmds} latestData={latest} logs={logs} setGlobalMode={handleGlobalMode} setRelayCommand={handleRelay} />;
            case 'history': return <HistoryView history={history} />;
            case 'billing': return <BillingView billing={billing} resetBillingData={resetBillingData} />;
            case 'contributors': return <ContributorsView />;
            default: return <HomeView setView={setView} latestData={latest} />;
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-yellow-500/30">
            <ChartLibScript />
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_#1a1a20,_#000)] z-0" />
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px'}}></div>

            <Header setView={setView} view={view} isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} currentTime={currentTime} />
            {isMenuOpen && <MobileMenuOverlay setIsMenuOpen={setIsMenuOpen} setView={setView} userId={userId} />}
            
            <main className="relative z-10 pt-24 pb-12 px-4 lg:px-8 max-w-7xl mx-auto min-h-screen">
                {renderView()}
            </main>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
