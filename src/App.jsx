// This is a single-file React application using functional components and hooks.
// V8: FINAL STABLE UI. Aggressive memoization applied to eliminate flickering caused by rapid Firestore updates.

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';

// Lucide Icons (Used for the modern UI)
import { 
    Zap, Radio, ChevronRight, Wind, Activity, Users, Database, Clock, 
    Terminal, AlertTriangle, Menu, X, Power, Battery, User, CheckCircle
} from 'lucide-react';

// --- Global Firebase Imports (Assumed available in the environment) ---
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, setDoc, addDoc, writeBatch } from 'firebase/firestore'; 
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

// --- CONFIGURATION ---
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const FIREBASE_CONFIG = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const SENSOR_COLLECTION_PATH = `artifacts/${APP_ID}/public/data/sensor_data`;
const RELAY_COLLECTION_PATH = `artifacts/${APP_ID}/public/data/relay_commands`;
const RELAY_LOGS_COLLECTION_PATH = `artifacts/${APP_ID}/public/data/relay_logs`; 

const NAV_ITEMS = ['Dashboard', 'Controls', 'History', 'Billing', 'Contributors'];

// --- Utility Functions ---
const getISTTime = () => {
    return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
};
const getISTDate = () => {
    return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' });
};
const isDataLive = (timestamp) => {
    if (!timestamp) return false;
    return (Date.now() - new Date(timestamp).getTime()) < 30000;
};


// --- Chart.js Setup (Crucial for graphs) ---
const ChartLibScript = () => {
    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js@3.7.0/dist/chart.min.js";
        script.async = true;
        document.body.appendChild(script);
        return () => { document.body.removeChild(script); };
    }, []);
    return null;
};

// --- Color Mapping Helper ---
const colorMap = {
    yellow: { text: 'text-yellow-400', border: 'border-yellow-500/30', hoverBorder: 'hover:border-yellow-500/30' },
    green: { text: 'text-green-400', border: 'border-green-500/30', hoverBorder: 'hover:border-green-500/30' },
    indigo: { text: 'text-indigo-400', border: 'border-indigo-500/30', hoverBorder: 'hover:border-indigo-500/30' },
    blue: { text: 'text-blue-400', border: 'border-blue-500/30', hoverBorder: 'hover:border-blue-500/30' },
    red: { text: 'text-red-400', border: 'border-red-500/30', hoverBorder: 'hover:border-red-500/30' }
};

// --- General Purpose Memoized UI Components ---

const GlassCard = memo(({ children, className = "", title, icon: Icon, accentColor = "yellow" }) => {
    const colors = colorMap[accentColor] || colorMap['yellow'];

    return (
        <div className={`relative overflow-hidden bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl p-6 transition-all duration-500 ${colors.hoverBorder} group ${className}`}>
            {title && (
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                    <div className="flex items-center gap-3">
                        {Icon && <Icon className={`w-4 h-4 ${colors.text}`} />}
                        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase font-mono">{title}</h3>
                    </div>
                </div>
            )}
            <div className="relative z-10">{children}</div>
        </div>
    );
});

const MetricCard = memo(({ title, value, icon: Icon, accent, color }) => {
    const colors = colorMap[accent] || colorMap['yellow'];

    return (
        <GlassCard icon={Icon} title={title} accentColor={accent} className="text-center">
            <p className={`text-4xl font-extrabold mt-1 ${color || colors.text}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-2 tracking-widest uppercase">{title}</p>
        </GlassCard>
    );
});

const ChartComponent = memo(({ data, type }) => {
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);

    // Deep Dependency on data structure to minimize re-renders
    const chartDataMemo = useMemo(() => {
        if (data.length === 0) return { labels: [], datasets: [] };

        const labels = data.map((d) => new Date(d.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        const isSolar = type === 'solar';
        const datasets = [];

        if (isSolar) {
            datasets.push({
                label: 'Solar Power (W)', data: data.map(d => d.solar_power_w), borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)', tension: 0.4, fill: true,
            });
        } else {
            datasets.push({
                label: 'Battery %', data: data.map(d => d.battery_level), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.4, fill: false, yAxisID: 'y1',
            });
            datasets.push({
                label: 'Load Power (W)', data: data.map(d => d.household_power_w), borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)', tension: 0.4, fill: true, yAxisID: 'y',
            });
        }
        return { labels, datasets };
    }, [data, type]);

    useEffect(() => {
        if (!chartRef.current || chartDataMemo.labels.length === 0 || !window.Chart) return;

        const ctx = chartRef.current.getContext('2d');
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }

        chartInstanceRef.current = new window.Chart(ctx, {
            type: 'line',
            data: chartDataMemo,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } } },
                scales: {
                    x: { grid: { color: '#ffffff05' }, ticks: { color: '#64748b' } },
                    y: {
                        type: 'linear', display: true, position: 'left',
                        title: { display: true, text: type === 'solar' ? 'Power (W)' : 'Power (W) / Voltage (V)', color: '#94a3b8' },
                        grid: { color: '#ffffff10' }, min: 0,
                    },
                    y1: type === 'solar' ? {} : {
                        type: 'linear', display: true, position: 'right',
                        title: { display: true, text: 'Battery Level (%)', color: '#94a3b8' },
                        grid: { drawOnChartArea: false }, ticks: { color: '#64748b' }, min: 0, max: 100,
                    },
                },
            },
        });

        return () => {
            if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); }
        };
    }, [chartDataMemo, type]);

    return (
        <div className="h-80 w-full bg-black/30 rounded-lg p-3">
            <canvas ref={chartRef}></canvas>
        </div>
    );
});


// --- Relay Control Card (Memoized) ---
const RelayControlCard = memo(({ relayNum, currentCommand, setCommand, latestData, isGlobalManual }) => {
    const title = relayNum === 1 ? 'Solar Diversion (R1)' :
                  relayNum === 2 ? 'Battery Load (R2)' :
                  'Grid Load (R3)';
    
    const isChecked = currentCommand.state;
    const isAuto = currentCommand.mode === 'auto';
    
    // Stabilize reported state check (derived from latestData)
    const reportedStateKey = `relay${relayNum}_state`;
    const reportedState = latestData ? latestData[reportedStateKey] : false;

    // Use derived state for rendering (avoids unnecessary re-renders)
    const renderProps = useMemo(() => {
        const getInfoText = () => {
            switch(relayNum) {
                case 1:
                    return {
                        on: "Directs Solar power to BATTERY for charging.",
                        off: "Directs Solar power to GRID (selling surplus)."
                    };
                case 2:
                    return {
                        on: "Connects BATTERY power to Household Load.",
                        off: "Disconnects BATTERY power from Household Load."
                    };
                case 3:
                    return {
                        on: "Connects GRID power to Household Load (emergency/low battery).",
                        off: "Disconnects GRID power from Household Load."
                    };
                default:
                    return { on: "Activated.", off: "Deactivated." };
            }
        };
        const info = getInfoText();
        return { isChecked, isAuto, reportedState, info, isGlobalManual };
    }, [isChecked, isAuto, reportedState, isGlobalManual]);
    
    const handleToggle = () => {
        if (!renderProps.isGlobalManual) {
            showToast("Mode is Auto", "Switch to Manual Mode first to change state.", 'destructive');
        } else {
            setCommand(relayNum, 'manual', !renderProps.isChecked);
        }
    };
    
    const colors = colorMap[renderProps.isAuto ? 'blue' : 'red'];

    return (
        <GlassCard title={title} icon={Radio} accentColor={renderProps.isAuto ? 'blue' : 'red'}>
            {/* Physical State */}
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <div>
                    <p className={`font-semibold text-3xl ${renderProps.reportedState ? 'text-green-400' : 'text-red-400'}`}>
                        {renderProps.reportedState ? 'ACTIVE' : 'IDLE'}
                    </p>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">Physical Status</p>
                </div>
                <div>
                    <p className={`text-xl font-semibold ${renderProps.isAuto ? 'text-blue-400' : 'text-yellow-400'}`}>
                        {renderProps.isAuto ? 'AUTO' : 'MANUAL'}
                    </p>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">Control Mode</p>
                </div>
            </div>

            {/* Info Text */}
            <div className="pt-3 pb-4 text-xs">
                <p className="text-green-400">ON: {renderProps.info.on}</p>
                <p className="text-red-400">OFF: {renderProps.info.off}</p>
            </div>


            {/* Toggle Command (Only enabled if global mode is MANUAL) */}
            <div className="py-4 border-t border-white/5">
                <button
                    onClick={handleToggle}
                    disabled={!renderProps.isGlobalManual} // Disabled if global is AUTO
                    className={`w-full py-3 rounded-lg font-bold text-white transition duration-200 ${!renderProps.isGlobalManual ? 'bg-gray-700/50 text-slate-400 cursor-not-allowed' : (renderProps.isChecked ? 'bg-red-700 hover:bg-red-600' : 'bg-green-700 hover:bg-green-600')}`}
                >
                    {!renderProps.isGlobalManual ? 'LOCKED (Global Auto)' : (renderProps.isChecked ? 'DEACTIVATE' : 'ACTIVATE')}
                </button>
            </div>
        </GlassCard>
    );
});


// --- CORE APPLICATION COMPONENT ---
const App = () => {
    // --- State Management ---
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [latestData, setLatestData] = useState(null);
    const [historicalData, setHistoricalData] = useState([]);
    const [relayCommands, setRelayCommands] = useState({
        1: { state: false, mode: 'auto' },
        2: { state: false, mode: 'auto' },
        3: { state: false, mode: 'auto' },
    });
    const [billingData, setBillingData] = useState({
        total_power_sold_wh: 0,
        total_power_utilized_wh: 0,
        selling_rate_per_kwh: 0.05,
        buying_rate_per_kwh: 0.15
    });
    const [relayLogs, setRelayLogs] = useState([]); // New state for logs
    const [view, setView] = useState('home'); 
    const [toast, setToast] = useState(null);
    const [currentTime, setCurrentTime] = useState(getISTTime());
    const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile Menu State

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        if (!FIREBASE_CONFIG) {
            console.error("Firebase config is missing.");
            return;
        }

        const firebaseApp = initializeApp(FIREBASE_CONFIG);
        const firestoreDb = getFirestore(firebaseApp);
        const firebaseAuth = getAuth(firebaseApp);

        setDb(firestoreDb);

        const authUnsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
            if (!user) {
                if (INITIAL_AUTH_TOKEN) {
                    try {
                        await signInWithCustomToken(firebaseAuth, INITIAL_AUTH_TOKEN);
                    } catch (error) {
                        await signInAnonymously(firebaseAuth);
                    }
                } else {
                    await signInAnonymously(firebaseAuth);
                }
            }
            setUserId(firebaseAuth.currentUser?.uid || `anon-${Math.random().toString(36).substring(2, 9)}`);
            setIsAuthReady(true);
            authUnsubscribe();
        });

        return () => {
            if (authUnsubscribe) authUnsubscribe();
        };
    }, []);

    // Live Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(getISTTime()), 1000);
        return () => clearInterval(timer);
    }, []);

    // --- Data Fetching (Real-time Listeners) ---
    useEffect(() => {
        if (!isAuthReady || !db) return;

        // Latest Data Listener
        const latestQuery = query(collection(db, SENSOR_COLLECTION_PATH), orderBy('timestamp', 'desc'), limit(1));
        const unsubscribeLatest = onSnapshot(latestQuery, (snapshot) => {
            if (!snapshot.empty) { setLatestData(snapshot.docs[0].data()); }
        });

        // Historical Data Listener
        const historyQuery = query(collection(db, SENSOR_COLLECTION_PATH), orderBy('timestamp', 'desc'), limit(20));
        const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
            setHistoricalData(data);
        });

        // Relay Commands Listener
        const unsubscribeRelays = onSnapshot(collection(db, RELAY_COLLECTION_PATH), (snapshot) => {
            const commands = {};
            snapshot.docs.forEach(doc => { commands[doc.id] = doc.data(); });
            setRelayCommands(prev => ({
                1: { ...prev[1], ...commands['1'] },
                2: { ...prev[2], ...commands['2'] },
                3: { ...prev[3], ...commands['3'] },
            }));
        });

        // Billing Data Listener (Firestore: billing_data doc)
        const unsubscribeBilling = onSnapshot(doc(db, RELAY_COLLECTION_PATH, 'billing_data'), (docSnapshot) => {
            if (docSnapshot.exists()) {
                setBillingData(docSnapshot.data());
            }
        });
        
        // NEW: Relay Logs Listener
        const logsQuery = query(collection(db, RELAY_LOGS_COLLECTION_PATH), orderBy('timestamp', 'desc'), limit(50));
        const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
            setRelayLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });


        return () => {
            unsubscribeLatest();
            unsubscribeHistory();
            unsubscribeRelays();
            unsubscribeBilling();
            unsubscribeLogs();
        };
    }, [db, isAuthReady]);

    // --- Actions ---

    const showToast = useCallback((title, message, type = 'default') => {
        const id = Date.now();
        setToast({ id, title, message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // Function to set the mode (AUTO/MANUAL) for ALL relays
    const setGlobalMode = useCallback(async (mode) => {
        if (!db || !userId) {
            showToast("Error", "Authentication or Database not ready.", 'destructive');
            return;
        }

        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const newMode = mode;
            
            // Log the global action
            await addDoc(collection(db, RELAY_LOGS_COLLECTION_PATH), {
                timestamp: now,
                relay: 'GLOBAL',
                state: newMode.toUpperCase(),
                source: 'MANUAL',
                reason: `Universal mode switch via UI.`,
            });
            
            // Loop through all three relays and update their mode
            for (let i = 1; i <= 3; i++) {
                const relayRef = doc(db, RELAY_COLLECTION_PATH, String(i));
                batch.set(relayRef, {
                    mode: newMode,
                    updatedAt: now,
                }, { merge: true });
            }
            
            await batch.commit();
            showToast("Mode Change", `All relays set to ${newMode.toUpperCase()} control.`, 'default');

        } catch (error) {
            console.error("Error setting global relay mode:", error);
            showToast("Error", `Failed to set global mode.`, 'destructive');
        }
    }, [db, userId, showToast]);


    const setRelayCommand = useCallback(async (relayNum, mode, state) => {
        if (!db || !userId) {
            showToast("Error", "Authentication or Database not ready.", 'destructive');
            return;
        }
        
        try {
            const relayId = String(relayNum);
            const relayRef = doc(db, RELAY_COLLECTION_PATH, relayId);
            const now = new Date().toISOString();
            
            // Safety Check: Prevent R2 and R3 from being ON simultaneously (Manual Mode only)
            if (mode === 'manual' && state === true) {
                if (relayNum === 2 && relayCommands['3'].state) {
                    showToast("Safety Error", "Cannot enable Battery (R2) while Grid (R3) is ON.", 'destructive');
                    return;
                }
                if (relayNum === 3 && relayCommands['2'].state) {
                    showToast("Safety Error", "Cannot enable Grid (R3) while Battery (R2) is ON.", 'destructive');
                    return;
                }
            }

            await setDoc(relayRef, {
                state: state,
                mode: mode,
                updatedAt: now,
            }, { merge: true });
            
            // --- LOGGING THE COMMAND (Manual) ---
            if (mode === 'manual') {
                await addDoc(collection(db, RELAY_LOGS_COLLECTION_PATH), {
                    timestamp: now,
                    relay: `R${relayNum}`,
                    state: state ? 'ON' : 'OFF',
                    source: 'MANUAL',
                    reason: `User override via UI.`,
                });
            }

            showToast("Command Sent", `R${relayNum} set to ${mode.toUpperCase()}: ${state ? 'ON' : 'OFF'}`, 'default');

        } catch (error) {
            showToast("Error", `Failed to send command for R${relayNum}.`, 'destructive');
        }
    }, [db, userId, showToast, relayCommands]);
    
    const resetBillingData = useCallback(async () => {
        if (!db || !userId) {
            showToast("Error", "Authentication or Database not ready.", 'destructive');
            return;
        }
        
        try {
            const billingRef = doc(db, RELAY_COLLECTION_PATH, 'billing_data');
            
            await setDoc(billingRef, {
                total_power_sold_wh: 0,
                total_power_utilized_wh: 0,
                last_reset_timestamp: new Date().toISOString(),
                selling_rate_per_kwh: billingData.selling_rate_per_kwh,
                buying_rate_per_kwh: billingData.buying_rate_per_kwh,
            });

            showToast("Billing Reset", "Accumulated power data has been reset.", 'default');

        } catch (error) {
            showToast("Error", `Failed to reset billing data.`, 'destructive');
        }
    }, [db, userId, showToast, billingData]);


    // --- UI Components ---

    const Header = () => {
        const liveStatus = latestData ? isDataLive(latestData.timestamp) : false;
        
        return (
            <header className="bg-black/90 backdrop-blur-lg border-b border-white/5 text-white shadow-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-20">
                    {/* Left: Title & Status */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-800 to-gray-900 border border-yellow-500/30 flex items-center justify-center shadow-lg">
                           <Zap className="w-6 h-6 text-yellow-400" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tighter text-white font-sans cursor-pointer" onClick={() => setView('home')}>
                            SOLAR<span className="text-slate-500">FLOW</span>
                        </h1>
                        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 ml-4">
                            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${liveStatus ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                                {liveStatus ? 'LIVE FEED' : 'OFFLINE'}
                            </span>
                        </div>
                    </div>

                    {/* Right: Navigation & Clock */}
                    <div className="flex items-center gap-6">
                        <nav className="hidden md:flex items-center gap-2 p-1">
                            {NAV_ITEMS.map((item) => (
                                <button key={item} onClick={() => setView(item.toLowerCase())}
                                    className={`relative px-4 py-2 text-sm font-bold tracking-widest uppercase font-mono transition-all duration-300 rounded-lg 
                                    ${view === item.toLowerCase() 
                                      ? 'text-white bg-yellow-600/20 border border-yellow-500/30 shadow-lg' 
                                      : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
                                    {item}
                                </button>
                            ))}
                        </nav>
                        <div className="hidden md:block text-right">
                            <div className="text-xs font-mono text-white tracking-wider">{currentTime}</div>
                            <div className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mt-1">{getISTDate()}</div>
                        </div>
                        {/* Mobile Menu Button */}
                        <button onClick={() => setIsMenuOpen(true)} className="md:hidden p-2 text-slate-300 hover:text-white"><Menu className="w-6 h-6" /></button>
                    </div>
                </div>
            </header>
        );
    };
    
    const MobileMenuOverlay = () => (
        <div className={`fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl transition-transform duration-500 flex flex-col justify-center items-center gap-8 ${isMenuOpen ? 'translate-y-0' : '-translate-y-full'}`}>
             <button onClick={() => setIsMenuOpen(false)} className="absolute top-6 right-6 p-3 bg-white/10 rounded-full"><X className="w-6 h-6 text-white" /></button>
             {NAV_ITEMS.map((item) => (
                 <button 
                     key={item} 
                     onClick={() => {setView(item.toLowerCase()); setIsMenuOpen(false);}} 
                     className="text-3xl font-bold tracking-widest uppercase text-white hover:text-yellow-500 transition-colors"
                 >
                     {item}
                 </button>
             ))}
             <p className="text-sm text-slate-500 mt-10">System Access ID: {userId ? userId.slice(0, 12) : 'AUTH PENDING'}</p>
        </div>
    );

    const Footer = () => (
        <footer className="w-full border-t border-white/5 bg-black/90 py-4 mt-auto">
            <div className="max-w-7xl mx-auto px-6 text-center text-xs text-gray-500">
                <p className="font-mono uppercase tracking-widest">&copy; {new Date().getFullYear()} Dilip Gowda & Hareeshkumar M. All Rights Reserved. • Project Code: 1RV23EC402/403</p>
            </div>
        </footer>
    );

    const HomeView = () => {
        const liveStatus = latestData ? isDataLive(latestData.timestamp) : false;
        
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-center p-8 bg-[radial-gradient(circle_at_center,_#111,_#000)]">
                <div className="relative mb-10">
                    <div className={`absolute -inset-10 rounded-full blur-[60px] transition-all duration-1000 ${liveStatus ? 'bg-green-500/10 animate-pulse' : 'bg-red-500/10'}`} />
                    <div className="relative w-40 h-40 rounded-full border-2 border-yellow-500/20 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                        <Zap className="w-16 h-16 text-yellow-400" />
                    </div>
                </div>
                
                <h1 className="text-7xl font-extrabold tracking-tighter text-white mb-4">
                    <span className="text-yellow-400">SOLAR</span><span className="text-slate-400">FLOW</span>
                </h1>
                <p className="text-slate-400 font-mono text-sm tracking-[0.3em] uppercase mb-12 max-w-md">
                    Autonomous Energy Diversion Console
                </p>
                
                <button 
                    onClick={() => setView('dashboard')}
                    className="group relative px-8 py-4 bg-yellow-500 text-gray-900 rounded-full font-bold tracking-widest uppercase hover:bg-yellow-400 transition-colors duration-300"
                >
                    <div className="flex items-center gap-2">
                        <span>Launch Dashboard</span>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-white/50 scale-110 opacity-0 group-hover:scale-125 group-hover:opacity-100 transition-all duration-500" />
                </button>
            </div>
        );
    };


    const DashboardView = () => {
        if (!latestData) return <p className="text-center p-8 text-gray-600">Awaiting initial data packet from ESP32...</p>;

        const batteryColor = latestData.battery_level > 80 ? 'green' : latestData.battery_level > 40 ? 'yellow' : 'red';
        const latestTime = new Date(latestData.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });

        return (
            <div className="space-y-8 p-6 max-w-7xl mx-auto text-white font-mono">
                <h2 className="text-3xl font-bold border-b border-yellow-500/20 pb-2 tracking-widest uppercase text-yellow-400">System Telemetry</h2>
                
                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard title="Solar Voltage" value={`${latestData.solar_voltage.toFixed(2)} V`} icon={Zap} accent="yellow" />
                    <MetricCard title="Battery Level" value={`${latestData.battery_level.toFixed(1)} %`} icon={Battery} accent="green" color={colorMap[batteryColor].text} />
                    <MetricCard title="Household Load" value={`${latestData.household_power_w.toFixed(2)} W`} icon={Power} accent="indigo" />
                    <MetricCard title="Load Current" value={`${latestData.household_current.toFixed(2)} A`} icon={Wind} accent="blue" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chart 1: Solar Power Flow */}
                    <GlassCard title="SOLAR POWER FLOW" icon={Activity} accentColor="yellow">
                        <ChartComponent data={historicalData} type="solar" />
                    </GlassCard>
                    
                    {/* Chart 2: Battery & Load State */}
                    <GlassCard title="BATTERY & LOAD STATUS" icon={Database} accentColor="green">
                        <ChartComponent data={historicalData} type="battery_grid" />
                    </GlassCard>
                </div>
                
                <p className="text-sm text-slate-600 text-right font-mono tracking-widest">LAST PACKET RECEIVED (IST): {latestTime}</p>
            </div>
        );
    };
    
    const ControlsView = () => {
        // Global mode is determined by checking the mode of R1 (or any single relay) for simplification
        const isAnyRelayManual = relayCommands[1].mode === 'manual' || relayCommands[2].mode === 'manual' || relayCommands[3].mode === 'manual';
        const isGlobalManual = isAnyRelayManual;
        
        return (
            <div className="space-y-8 p-6 max-w-7xl mx-auto text-white font-mono">
                <h2 className="text-3xl font-bold border-b border-yellow-500/20 pb-2 tracking-widest uppercase text-yellow-400">Manual Command Console</h2>
                
                {/* Universal Auto/Manual Control */}
                <GlassCard title="GLOBAL CONTROL OVERRIDE" icon={Database} accentColor={isGlobalManual ? 'red' : 'green'}>
                    <p className="text-sm text-slate-400 mb-4">
                        Current System Mode: 
                        <span className={`font-bold ml-2 ${isGlobalManual ? 'text-red-400' : 'text-green-400'}`}>
                            {isGlobalManual ? 'MANUAL OVERRIDE' : 'AUTONOMOUS'}
                        </span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => setGlobalMode('auto')}
                            disabled={!isGlobalManual}
                            className={`py-3 rounded-lg font-bold text-sm transition duration-200 ${!isGlobalManual ? 'bg-green-700/50 text-white cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-black'}`}
                        >
                            Set ALL AUTO
                        </button>
                        <button
                            onClick={() => setGlobalMode('manual')}
                            disabled={isGlobalManual}
                            className={`py-3 rounded-lg font-bold text-sm transition duration-200 ${isGlobalManual ? 'bg-red-700/50 text-white cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                        >
                            Set ALL MANUAL
                        </button>
                    </div>
                </GlassCard>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {[1, 2, 3].map(relayNum => (
                        <RelayControlCard
                            key={relayNum}
                            relayNum={relayNum}
                            currentCommand={relayCommands[relayNum]}
                            setCommand={setRelayCommand}
                            latestData={latestData}
                            isGlobalManual={isGlobalManual}
                        />
                    ))}
                </div>

                {/* Logs Section in Controls View */}
                <h3 className="text-xl font-bold border-b border-white/10 pb-2 tracking-wider uppercase text-slate-300">
                    Switching Event Log
                </h3>
                <div className="overflow-y-auto max-h-96 rounded-xl bg-black/60 border border-white/10">
                    <table className="min-w-full divide-y divide-white/10">
                        <thead className="bg-black/80 sticky top-0">
                            <tr>
                                {['Time (IST)', 'Relay', 'Action', 'Source', 'Reason'].map(header => (
                                    <th key={header} className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {relayLogs.length > 0 ? relayLogs.map((log, index) => (
                                <tr key={index} className="hover:bg-white/5">
                                    <td className="px-6 py-3 whitespace-nowrap text-xs text-slate-300">
                                        {new Date(log.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-bold text-yellow-400">{log.relay}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.state === 'ON' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                                            {log.state}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <span className={`text-[10px] font-bold ${log.source === 'MANUAL' ? 'text-indigo-400' : 'text-blue-400'}`}>
                                            {log.source}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-xs text-slate-400">{log.reason}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5" className="px-6 py-4 text-center text-slate-500">No switching events logged yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };
    
    const HistoryView = () => {
        const historyDataForTable = historicalData.slice(0, 20).map(d => ({...d, timestamp: new Date(d.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}));

        return (
            <div className="space-y-6 p-6 max-w-7xl mx-auto text-white font-mono">
                <h2 className="text-3xl font-bold border-b border-yellow-500/20 pb-2 tracking-widest uppercase text-yellow-400">System Log History</h2>
                <div className="overflow-x-auto rounded-xl shadow-lg bg-black/60 border border-white/10">
                    <table className="min-w-full divide-y divide-white/10">
                        <thead className="bg-black/80 sticky top-0">
                            <tr>
                                {['Time (IST)', 'Bat % (V/A)', 'Solar (W/A)', 'Grid (V/A)', 'Load (W)', 'R1/R2/R3'].map(header => (
                                    <th key={header} className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {historyDataForTable.length > 0 ? historyDataForTable.map((d, index) => (
                                <tr key={d.id || index} className={index % 2 === 0 ? 'bg-white/5' : 'bg-transparent'}>
                                    <td className="px-6 py-3 whitespace-nowrap text-xs font-mono text-slate-300">{d.timestamp.slice(0, 10)}<br/>{d.timestamp.slice(12)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-green-400">{d.battery_level.toFixed(1)}% ({d.battery_voltage.toFixed(2)}V / {d.battery_current.toFixed(2)}A)</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-yellow-400">{d.solar_power_w.toFixed(2)}W ({d.solar_current.toFixed(2)}A)</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-blue-400">{d.grid_voltage.toFixed(2)}V / {d.household_current.toFixed(2)}A</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-indigo-400">{d.household_power_w.toFixed(2)}W</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-xs">
                                        <RelayStatusBadge state={d.relay1_state} label="R1"/>
                                        <RelayStatusBadge state={d.relay2_state} label="R2"/>
                                        <RelayStatusBadge state={d.relay3_state} label="R3"/>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="6" className="px-6 py-4 text-center text-slate-500">No sensor data available.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };
    
    const BillingView = () => {
        const totalSoldKWh = billingData.total_power_sold_wh / 1000;
        const totalUtilizedKWh = billingData.total_power_utilized_wh / 1000;
        const revenue = totalSoldKWh * billingData.selling_rate_per_kwh;
        const bill = totalUtilizedKWh * billingData.buying_rate_per_kwh;
        
        return (
            <div className="space-y-8 p-6 max-w-7xl mx-auto text-white font-mono">
                <h2 className="text-3xl font-bold border-b border-yellow-500/20 pb-2 tracking-widest uppercase text-yellow-400">Billing & Efficiency</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <GlassCard title="NET REVENUE (SOLD)" icon={Zap} accentColor="green">
                        <p className="text-4xl font-extrabold text-green-400">₹{revenue.toFixed(2)}</p>
                        <p className="text-xs text-slate-500 mt-2 tracking-widest uppercase">From {totalSoldKWh.toFixed(2)} kWh diverted to grid</p>
                    </GlassCard>
                    
                    <GlassCard title="NET BILL (UTILIZED)" icon={Power} accentColor="red">
                        <p className="text-4xl font-extrabold text-red-400">₹{bill.toFixed(2)}</p>
                        <p className="text-xs text-slate-500 mt-2 tracking-widest uppercase">For {totalUtilizedKWh.toFixed(2)} kWh used from grid</p>
                    </GlassCard>
                    
                    <GlassCard title="RATES & RESET" icon={Database} accentColor="blue">
                        <p className="text-sm text-slate-400 mb-2">Selling Rate: <span className="font-bold text-yellow-400">₹{billingData.selling_rate_per_kwh.toFixed(2)} / kWh</span></p>
                        <p className="text-sm text-slate-400 mb-4">Buying Rate: <span className="font-bold text-red-400">₹{billingData.buying_rate_per_kwh.toFixed(2)} / kWh</span></p>
                        <button
                            onClick={resetBillingData}
                            className="w-full py-2 rounded-lg font-bold text-xs uppercase transition duration-200 bg-red-800/50 hover:bg-red-700/60 text-white"
                        >
                            Reset Billing Data
                        </button>
                    </GlassCard>
                </div>
            </div>
        );
    };

    const ContributorsView = () => (
        <div className="space-y-8 p-6 max-w-7xl mx-auto text-white font-mono">
            <h2 className="text-3xl font-bold border-b border-yellow-500/20 pb-2 tracking-widest uppercase text-yellow-400">Mission Crew Access</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ContributorCard name="Dilip Kumar A N" role="Embedded Systems Engineer" id="1RV23EC402" />
                <ContributorCard name="Hareeshkumar M" role="Software & Backend Specialist" id="1RV23EC403" />
            </div>
            
            <GlassCard title="SYSTEM SPECIFICATIONS" icon={Terminal} accentColor="blue">
                <div className="grid grid-cols-2 gap-4 text-xs text-slate-400">
                    <p><strong>Microcontroller:</strong> ESP32</p>
                    <p><strong>DB Protocol:</strong> Firestore (Real-time)</p>
                    <p><strong>Battery Type:</strong> 2 x 18650 Li-ion Parallel</p>
                    <p><strong>Relay Logic:</strong> Hysteresis State Machine</p>
                </div>
            </GlassCard>
        </div>
    );

    const ContributorCard = ({ name, role, id }) => {
        const accent = 'indigo';
        const colors = colorMap[accent];

        return (
            <GlassCard className={`p-5 border-l-4 ${colors.border}`} accentColor={accent}>
                <div className="flex items-center space-x-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center ${colors.text}`}>
                        <User className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-white">{name}</p>
                        <p className="text-sm text-slate-400">{role}</p>
                        <p className="text-xs text-slate-600">ID: {id}</p>
                    </div>
                </div>
            </GlassCard>
        );
    };

    const RelayStatusBadge = ({ state, label }) => (
        <span className={`px-2 inline-flex text-[10px] leading-5 font-semibold rounded-full mr-1 ${state ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
            {label}:{state ? 'ON' : 'OFF'}
        </span>
    );
    

    // --- Main Render ---
    const renderView = () => {
        switch (view) {
            case 'home': return <HomeView />;
            case 'dashboard': return <DashboardView />;
            case 'controls': return <ControlsView />;
            case 'history': return <HistoryView />;
            case 'billing': return <BillingView />;
            case 'contributors': return <ContributorsView />;
            default: return <HomeView />;
        }
    };

    return (
        // Global Container with dark background and tech font style
        <div className="flex flex-col min-h-screen bg-[#080808] text-slate-200 font-sans">
            <ChartLibScript /> {/* CHART.JS LIBRARY LOADED HERE */}
            <div className="fixed inset-0 pointer-events-none z-0"><div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#111,_#000)]" /></div>
            
            <Header />
            <MobileMenuOverlay />
            
            <main className="relative z-10 flex-1 p-6 lg:p-12 w-full">
                {renderView()}
            </main>
            
            <Footer />
            
            {/* Toast Notification Area */}
            {toast && (
                <div className={`fixed top-24 right-6 z-50 flex items-center gap-4 px-6 py-4 rounded-xl border backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-500 animate-in slide-in-from-right-full 
                    ${toast.type === 'destructive' ? 'bg-red-900/20 border-red-500/30 text-red-400' : 'bg-green-900/20 border-green-500/30 text-green-400'}`}>
                    
                    <div className={`p-2 rounded-full ${toast.type === 'destructive' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                        {toast.type === 'destructive' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                    </div>
                    
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                            {toast.type === 'destructive' ? 'SYSTEM ALERT' : 'SUCCESS'}
                        </span>
                        <span className="font-mono text-xs font-bold tracking-wide uppercase">{toast.message}</span>
                    </div>
                    
                    <button onClick={() => setToast(null)} className="ml-4 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default App;
