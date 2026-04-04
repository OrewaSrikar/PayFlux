import { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Shield, AlertTriangle, CheckCircle, Activity, CloudRain, Wind, Car, Clock, IndianRupee, Zap, User as UserIcon, LogOut, LayoutDashboard, FileText, History, Settings, Menu, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchRealTimeRiskData, verifyIncomeFromDocument } from './services/geminiService';

// --- Types ---
interface UserData {
  uid: string;
  name: string;
  city: string;
  deliveryType: string;
  hourlyIncome: number;
  incomeVerified?: boolean;
  verificationStatus?: 'pending' | 'verified' | 'rejected' | 'none';
  createdAt: any;
}

interface PolicyData {
  id: string;
  userId: string;
  status: 'active' | 'expired';
  premium: number;
  riskScore: number;
  startDate: any;
  endDate: any;
}

interface ClaimData {
  id: string;
  userId: string;
  policyId: string;
  triggerType: string;
  amount: number;
  status: 'processed' | 'pending';
  timestamp: any;
}

type Tab = 'dashboard' | 'policy' | 'claims' | 'profile' | 'admin';

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePolicy, setActivePolicy] = useState<PolicyData | null>(null);
  const [claims, setClaims] = useState<ClaimData[]>([]);
  const [riskMetrics, setRiskMetrics] = useState({ weather: 0, aqi: 0, traffic: 0, curfew: false });
  const [notifications, setNotifications] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [currentTab, setCurrentTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [lastPayout, setLastPayout] = useState<{ amount: number; reason: string } | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners (Policies & Claims)
  useEffect(() => {
    if (!user) return;

    const policiesQuery = query(collection(db, 'policies'), where('userId', '==', user.uid), where('status', '==', 'active'));
    const unsubscribePolicies = onSnapshot(policiesQuery, (snapshot) => {
      if (!snapshot.empty) {
        setActivePolicy({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as PolicyData);
      } else {
        setActivePolicy(null);
      }
    });

    const claimsQuery = query(collection(db, 'claims'), where('userId', '==', user.uid));
    const unsubscribeClaims = onSnapshot(claimsQuery, (snapshot) => {
      const c = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClaimData));
      setClaims(c.sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds));
    });

    return () => {
      unsubscribePolicies();
      unsubscribeClaims();
    };
  }, [user]);

  // Real-time Risk Metrics with Gemini
  const fetchMetrics = useCallback(async () => {
    if (!userData?.city) return;
    try {
      const data = await fetchRealTimeRiskData(userData.city);
      setRiskMetrics({
        weather: data.rainfall,
        aqi: data.aqi,
        traffic: data.congestion,
        curfew: data.curfew
      });
    } catch (err) {
      console.error("Failed to fetch metrics", err);
    }
  }, [userData?.city]);

  useEffect(() => {
    if (!userData?.city) return;
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Poll every 60 seconds
    return () => clearInterval(interval);
  }, [userData?.city, fetchMetrics]);

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  const handleRegister = async (data: Omit<UserData, 'uid' | 'createdAt'>) => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const uid = userCredential.user.uid;
      const newUser: UserData = {
        ...data,
        uid,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', uid), newUser);
      setUserData(newUser);
      addNotification("Registration Successful!", "success");
    } catch (err: any) {
      addNotification(err.message || "Registration Failed", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (updatedData: Partial<UserData>) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), updatedData, { merge: true });
      setUserData(prev => prev ? { ...prev, ...updatedData } : null);
      addNotification("Profile Updated!", "success");
    } catch (err) {
      addNotification("Update Failed", "error");
    }
  };

  const handleVerifyIncome = async (base64Image: string, mimeType: string) => {
    if (!user) return;
    try {
      addNotification("Analyzing document...", "info");
      const result = await verifyIncomeFromDocument(base64Image, mimeType);
      
      if (result.verified) {
        const updatedData = {
          incomeVerified: true,
          verificationStatus: 'verified' as const,
          hourlyIncome: result.extractedIncome
        };
        await setDoc(doc(db, 'users', user.uid), updatedData, { merge: true });
        setUserData(prev => prev ? { ...prev, ...updatedData } : null);
        addNotification(`Income Verified: ₹${result.extractedIncome}/hr`, "success");
      } else {
        addNotification(`Verification Failed: ${result.reason}`, "error");
      }
    } catch (err: any) {
      addNotification("Verification failed. Please try again.", "error");
      console.error(err);
    }
  };

  const calculatePremium = () => {
    const riskScore = (riskMetrics.weather / 20 + riskMetrics.aqi / 300 + riskMetrics.traffic / 100 + (riskMetrics.curfew ? 1 : 0)) / 4;
    const basePrice = 49; // Base weekly premium in INR
    return Math.round(basePrice * (1 + riskScore));
  };

  const calculateActivityScore = (metrics: typeof riskMetrics) => {
    let score = 100;
    
    // Rainfall reduction: -2 per mm/hr
    score -= metrics.weather * 2;
    
    // AQI reduction: -0.1 per AQI point above 100
    if (metrics.aqi > 100) {
      score -= (metrics.aqi - 100) * 0.1;
    }
    
    // Traffic reduction: -0.5 per % congestion
    score -= metrics.traffic * 0.5;
    
    // Curfew reduction: -100 if active
    if (metrics.curfew) {
      score -= 100;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const activatePolicy = async () => {
    if (!user || !userData) return;
    try {
      const riskScore = (riskMetrics.weather / 20 + riskMetrics.aqi / 300 + riskMetrics.traffic / 100 + (riskMetrics.curfew ? 1 : 0)) / 4;
      const premium = calculatePremium();
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + 7);

      await addDoc(collection(db, 'policies'), {
        userId: user.uid,
        status: 'active',
        premium,
        riskScore,
        startDate: serverTimestamp(),
        endDate: endDate.toISOString()
      });
      addNotification("Weekly Insurance Activated!", "success");
    } catch (err) {
      addNotification("Activation Failed", "error");
    }
  };

  const cancelPolicy = async () => {
    if (!activePolicy) return;
    try {
      await setDoc(doc(db, 'policies', activePolicy.id), { status: 'expired' }, { merge: true });
      addNotification("Policy Cancelled Successfully", "info");
    } catch (err) {
      addNotification("Cancellation Failed", "error");
    }
  };

  const simulateDisruption = async (type: string) => {
    if (!activePolicy || !userData) {
      addNotification("Activate a policy first!", "error");
      return;
    }

    try {
      const res = await fetch('/api/simulate-disruption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      
      if (data.success) {
        addNotification(data.trigger.message, "info");
        
        // Update local metrics to reflect the simulation
        if (type === 'rain') setRiskMetrics(prev => ({ ...prev, weather: 15 }));
        if (type === 'aqi') setRiskMetrics(prev => ({ ...prev, aqi: 210 }));
        if (type === 'traffic') setRiskMetrics(prev => ({ ...prev, traffic: 85 }));
        if (type === 'curfew') setRiskMetrics(prev => ({ ...prev, curfew: true }));

        // Auto-generate claim
        const payout = userData.hourlyIncome * 2; // Assume 2 hours disruption
        await addDoc(collection(db, 'claims'), {
          userId: user?.uid,
          policyId: activePolicy.id,
          triggerType: data.trigger.message,
          amount: payout,
          status: 'processed',
          timestamp: serverTimestamp()
        });
        
        setLastPayout({ amount: payout, reason: data.trigger.message });
        setShowPayoutModal(true);
        addNotification(`₹${payout} credited successfully!`, "success");
      }
    } catch (err) {
      addNotification("Simulation Failed", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 ${
                n.type === 'success' ? 'bg-emerald-900/50 border-emerald-500 text-emerald-200' :
                n.type === 'error' ? 'bg-rose-900/50 border-rose-500 text-rose-200' :
                'bg-blue-900/50 border-blue-500 text-blue-200'
              }`}
            >
              {n.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Payout Modal */}
      <AnimatePresence>
        {showPayoutModal && lastPayout && (
          <PayoutModal 
            amount={lastPayout.amount} 
            reason={lastPayout.reason} 
            onClose={() => setShowPayoutModal(false)} 
          />
        )}
      </AnimatePresence>

      {!userData ? (
        <Registration onRegister={handleRegister} />
      ) : (
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className={`bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
            <div className="p-6 flex items-center gap-3 border-b border-slate-800">
              <Shield className="text-blue-500 shrink-0" size={28} />
              {isSidebarOpen && <span className="font-bold text-xl tracking-tight">PayFlux</span>}
            </div>
            
            <nav className="flex-1 p-4 space-y-2">
              <SidebarItem 
                icon={<LayoutDashboard size={20} />} 
                label="Dashboard" 
                active={currentTab === 'dashboard'} 
                isOpen={isSidebarOpen} 
                onClick={() => setCurrentTab('dashboard')} 
              />
              <SidebarItem 
                icon={<FileText size={20} />} 
                label="Policy" 
                active={currentTab === 'policy'} 
                isOpen={isSidebarOpen} 
                onClick={() => setCurrentTab('policy')} 
              />
              <SidebarItem 
                icon={<History size={20} />} 
                label="Claims" 
                active={currentTab === 'claims'} 
                isOpen={isSidebarOpen} 
                onClick={() => setCurrentTab('claims')} 
              />
              <SidebarItem 
                icon={<UserIcon size={20} />} 
                label="Profile" 
                active={currentTab === 'profile'} 
                isOpen={isSidebarOpen} 
                onClick={() => setCurrentTab('profile')} 
              />
              <SidebarItem 
                icon={<Settings size={20} />} 
                label="Admin" 
                active={currentTab === 'admin'} 
                isOpen={isSidebarOpen} 
                onClick={() => setCurrentTab('admin')} 
              />
            </nav>

            <div className="p-4 border-t border-slate-800">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="w-full flex items-center justify-center p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
              >
                {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {/* Topbar */}
            <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-8 shrink-0">
              <h2 className="text-lg font-semibold capitalize">{currentTab}</h2>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700">
                  <div className="w-7 h-7 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <UserIcon size={14} className="text-blue-400" />
                  </div>
                  <span className="text-sm font-medium mr-2">{userData.name}</span>
                  <button onClick={() => auth.signOut()} className="text-slate-500 hover:text-slate-300 transition-colors">
                    <LogOut size={16} />
                  </button>
                </div>
              </div>
            </header>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentTab === 'dashboard' && (
                    <DashboardView 
                      userData={userData} 
                      riskMetrics={riskMetrics} 
                      premium={calculatePremium()} 
                      activePolicy={activePolicy}
                      claims={claims}
                      calculateActivityScore={calculateActivityScore}
                    />
                  )}
                  {currentTab === 'policy' && (
                    <PolicyView 
                      activePolicy={activePolicy} 
                      onActivate={activatePolicy} 
                      onCancel={cancelPolicy}
                      premium={calculatePremium()} 
                    />
                  )}
                  {currentTab === 'claims' && (
                    <ClaimsView claims={claims} />
                  )}
                  {currentTab === 'profile' && (
                    <ProfileView 
                      userData={userData} 
                      onUpdateProfile={handleUpdateProfile} 
                      onVerifyIncome={handleVerifyIncome}
                    />
                  )}
                  {currentTab === 'admin' && (
                    <AdminView 
                      onSimulate={simulateDisruption} 
                      claims={claims} 
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

// --- Sub-Components ---

function SidebarItem({ icon, label, active, isOpen, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group ${
        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {isOpen && <span className="font-medium text-sm">{label}</span>}
      {active && isOpen && <ChevronRight size={14} className="ml-auto opacity-50" />}
    </button>
  );
}

function DashboardView({ userData, riskMetrics, premium, activePolicy, claims, calculateActivityScore }: any) {
  const riskScore = Math.round(((riskMetrics.weather / 20 + riskMetrics.aqi / 300 + riskMetrics.traffic / 100 + (riskMetrics.curfew ? 1 : 0)) / 4) * 100);
  const activityScore = calculateActivityScore(riskMetrics);
  const activityStatus = activityScore < 50 ? 'Disrupted' : activityScore < 80 ? 'Reduced' : 'Normal';
  const activityColor = activityScore < 50 ? 'text-rose-500' : activityScore < 80 ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="space-y-8 pb-10">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center justify-center text-center">
          <RiskGauge score={riskScore} />
          <p className="text-slate-500 text-xs font-medium mt-4">Overall Risk Score</p>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center justify-center text-center">
           <div className="relative flex items-center justify-center w-24 h-24">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-800" />
                <motion.circle
                  cx="48"
                  cy="48"
                  r="36"
                  stroke={activityScore < 50 ? '#f43f5e' : activityScore < 80 ? '#f59e0b' : '#10b981'}
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 36}
                  initial={{ strokeDashoffset: 2 * Math.PI * 36 }}
                  animate={{ strokeDashoffset: (2 * Math.PI * 36) - (activityScore / 100) * (2 * Math.PI * 36) }}
                  transition={{ duration: 1 }}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-xl font-bold ${activityColor}`}>{activityScore}%</span>
              </div>
           </div>
           <p className="text-slate-500 text-xs font-medium mt-4">Delivery Activity</p>
           <span className={`text-[10px] font-black uppercase tracking-widest mt-1 ${activityColor}`}>{activityStatus}</span>
        </div>

        <StatCard 
          label="Current Premium" 
          value={`₹${premium}`} 
          subValue="Weekly" 
          icon={<IndianRupee size={20} className="text-emerald-500" />} 
        />
        <StatCard 
          label="Active Policy" 
          value={activePolicy ? 'Active' : 'None'} 
          icon={<Shield size={20} className={activePolicy ? 'text-emerald-500' : 'text-slate-500'} />} 
        />
        <StatCard 
          label="Total Payouts" 
          value={`₹${claims.reduce((acc: number, c: any) => acc + c.amount, 0)}`} 
          icon={<Zap size={20} className="text-amber-500" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Risk Environment */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-lg">AI Risk Prediction</h3>
              <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full uppercase">{userData.city}</span>
            </div>
            
            <AIRiskExplanation riskMetrics={riskMetrics} />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <RiskMetric 
                icon={<CloudRain size={18} className="text-blue-400" />} 
                label="Rain Risk" 
                value={`${riskMetrics.weather.toFixed(1)}mm`} 
                percent={riskMetrics.weather / 20 * 100}
              />
              <RiskMetric 
                icon={<Wind size={18} className="text-emerald-400" />} 
                label="AQI Risk" 
                value={riskMetrics.aqi} 
                percent={riskMetrics.aqi / 300 * 100}
              />
              <RiskMetric 
                icon={<Car size={18} className="text-amber-400" />} 
                label="Traffic Risk" 
                value={`${riskMetrics.traffic}%`} 
                percent={riskMetrics.traffic}
              />
            </div>
          </div>

          {/* Activity Timeline */}
          <ActivityTimeline claims={claims} riskMetrics={riskMetrics} />
        </div>

        <div className="space-y-8">
          {/* Profile Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Worker Profile</h3>
            <div className="space-y-4">
              <ProfileItem label="Vehicle" value={userData.deliveryType} />
              <ProfileItem label="City" value={userData.city} />
              <ProfileItem label="Hourly Rate" value={`₹${userData.hourlyIncome}`} />
              <ProfileItem label="Member Since" value={userData.createdAt?.toDate().toLocaleDateString() || 'N/A'} />
            </div>
          </div>

          {/* Quick Action */}
          {!activePolicy && (
            <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-600/20">
              <Shield size={32} className="mb-4 opacity-50" />
              <h3 className="text-lg font-bold mb-2">Unprotected!</h3>
              <p className="text-sm text-blue-100 mb-6">You are currently working without shield protection. Activate now to secure your earnings.</p>
              <button className="w-full bg-white text-blue-600 font-bold py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
                Get Protected
              </button>
            </div>
          )}

          {/* Recent Claims (Moved to sidebar for better layout) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h3 className="font-semibold text-sm">Recent Claims</h3>
            </div>
            <div className="p-0">
              {claims.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">No claims.</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {claims.slice(0, 3).map((claim: any) => (
                    <div key={claim.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-blue-400" />
                        <div>
                          <p className="text-xs font-medium truncate w-24">{claim.triggerType}</p>
                          <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{claim.status}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-400">₹{claim.amount}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyView({ activePolicy, onActivate, onCancel, premium }: any) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <h2 className="text-2xl font-bold mb-2">Weekly Shield Protection</h2>
            <p className="text-slate-400">Comprehensive coverage for environmental and traffic disruptions.</p>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest ${
            activePolicy ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'
          }`}>
            {activePolicy ? 'Active' : 'Inactive'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Coverage Details</h3>
            <ul className="space-y-4">
              <CoverageItem label="Heavy Rainfall" description="Payout triggered when rainfall exceeds 10mm/hr" />
              <CoverageItem label="Hazardous Air" description="Payout triggered when AQI exceeds 150" />
              <CoverageItem label="Gridlock Traffic" description="Payout triggered during severe congestion (>70%)" />
              <CoverageItem label="Local Curfews" description="Full hourly rate protection during emergency curfews" />
            </ul>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Pricing</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">₹{premium}</span>
                <span className="text-slate-500 font-medium">/ week</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">* Premium is calculated dynamically based on current city risk.</p>
            </div>
            
            {!activePolicy ? (
              <button 
                onClick={onActivate}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 mt-8"
              >
                Activate Weekly Shield
              </button>
            ) : (
              <div className="mt-8 space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                  <p className="text-emerald-500 font-bold text-sm">Policy is currently active</p>
                  <p className="text-[10px] text-emerald-600 uppercase font-bold mt-1">Renewal: {new Date(activePolicy.endDate).toLocaleDateString()}</p>
                </div>
                
                {!showConfirmCancel ? (
                  <button 
                    onClick={() => setShowConfirmCancel(true)}
                    className="w-full bg-slate-800 hover:bg-rose-900/30 text-slate-400 hover:text-rose-400 text-xs font-bold py-2 rounded-lg transition-all border border-slate-700 hover:border-rose-500/50"
                  >
                    Opt-out of Policy
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={onCancel}
                      className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2 rounded-lg transition-all"
                    >
                      Confirm Cancel
                    </button>
                    <button 
                      onClick={() => setShowConfirmCancel(false)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded-lg transition-all"
                    >
                      Keep Policy
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimsView({ claims }: any) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold">Claim History</h2>
          <p className="text-sm text-slate-400">All claims are processed automatically by the PayFlux Trigger Engine.</p>
        </div>
        <div className="overflow-x-auto">
          {claims.length === 0 ? (
            <div className="p-20 text-center text-slate-500">No claims found.</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">ID</th>
                  <th className="px-6 py-4 font-medium">Trigger Event</th>
                  <th className="px-6 py-4 font-medium">Payout</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {claims.map((claim: any) => (
                  <tr key={claim.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">#{claim.id.slice(-6).toUpperCase()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" />
                        <span className="text-sm font-medium">{claim.triggerType}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-400">₹{claim.amount}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded uppercase border border-emerald-500/20">
                        {claim.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {claim.timestamp?.toDate().toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminView({ onSimulate, claims }: any) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            Trigger Simulation
          </h3>
          <p className="text-sm text-slate-400 mb-6">Manually trigger environmental disruptions to test the automation engine.</p>
          <div className="space-y-3">
            <SimButton onClick={() => onSimulate('rain')} label="Heavy Rain (>10mm)" icon={<CloudRain size={16} />} />
            <SimButton onClick={() => onSimulate('aqi')} label="Hazardous AQI (>150)" icon={<Wind size={16} />} />
            <SimButton onClick={() => onSimulate('traffic')} label="Severe Traffic (>70%)" icon={<Car size={16} />} />
            <SimButton onClick={() => onSimulate('curfew')} label="Emergency Curfew" icon={<AlertTriangle size={16} />} />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            System Stats
          </h3>
          <div className="grid grid-cols-1 gap-6 mt-4">
            <AdminStat label="Claims Processed" value={claims.length} />
            <AdminStat label="Payout Volume" value={`₹${claims.reduce((acc: number, c: any) => acc + c.amount, 0)}`} />
            <AdminStat label="System Uptime" value="99.9%" />
            <AdminStat label="Payout Speed" value="< 2s" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ userData, onUpdateProfile, onVerifyIncome }: any) {
  const [editData, setEditData] = useState({
    city: userData?.city || '',
    deliveryType: userData?.deliveryType || 'Bike',
    hourlyIncome: userData?.hourlyIncome || 150
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVerifying(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        await onVerifyIncome(base64String, file.type);
        setIsVerifying(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    await onUpdateProfile(editData);
    setIsSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <UserIcon size={24} className="text-blue-500" />
          Worker Profile Settings
        </h3>
        <p className="text-slate-400 text-sm mb-8 border-b border-slate-800 pb-4">
          Manage your account details and delivery preferences.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Full Name</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed">
                {userData?.name}
              </div>
              <p className="text-[10px] text-slate-600 italic">Name cannot be changed after registration.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Current City</label>
              <input 
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={editData.city}
                onChange={e => setEditData({...editData, city: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Vehicle Type</label>
              <select 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={editData.deliveryType}
                onChange={e => setEditData({...editData, deliveryType: e.target.value})}
              >
                <option>Bike</option>
                <option>Scooter</option>
                <option>Car</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Hourly Income (₹)</label>
              <input 
                type="number"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={editData.hourlyIncome}
                onChange={e => setEditData({...editData, hourlyIncome: parseInt(e.target.value)})}
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSaving}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 mt-4 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isSaving ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (
              <>
                <CheckCircle size={20} />
                Update Profile Details
              </>
            )}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h4 className="text-lg font-bold flex items-center gap-2">
                <FileText size={20} className="text-amber-500" />
                Income Verification
              </h4>
              <p className="text-xs text-slate-500">Verify your income to unlock higher coverage and lower premiums.</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
              userData?.incomeVerified 
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
            }`}>
              {userData?.incomeVerified ? 'Verified' : 'Unverified'}
            </div>
          </div>

          {userData?.incomeVerified ? (
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                <CheckCircle className="text-emerald-500" size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-400">Income Verified at ₹{userData.hourlyIncome}/hr</p>
                <p className="text-xs text-slate-500">Your earnings are now fully protected by PayFlux AI.</p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                  <Activity className="text-blue-500" size={32} />
                </div>
                <h5 className="font-bold mb-1">Upload Paystub or Statement</h5>
                <p className="text-xs text-slate-500 mb-6 max-w-xs">Upload a screenshot of your weekly earnings from Uber, Swiggy, or Zomato for AI verification.</p>
                
                <label className="relative cursor-pointer group">
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileChange}
                    disabled={isVerifying}
                  />
                  <div className={`flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 ${isVerifying ? 'opacity-50' : ''}`}>
                    {isVerifying ? (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                    ) : (
                      <FileText size={18} />
                    )}
                    {isVerifying ? 'Verifying...' : 'Select Document'}
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- UI Helpers ---

function StatCard({ label, value, subValue, icon, trend }: any) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">{icon}</div>
        {trend && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${trend === 'high' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
            {trend === 'high' ? 'High Risk' : 'Low Risk'}
          </span>
        )}
      </div>
      <p className="text-slate-500 text-xs font-medium mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <h4 className="text-2xl font-bold text-white">{value}</h4>
        {subValue && <span className="text-slate-500 text-xs">{subValue}</span>}
      </div>
    </div>
  );
}

function RiskMetric({ icon, label, value, percent }: any) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-slate-400">{label}</span>
        </div>
        <span className="text-xs font-bold">{value}</span>
      </div>
      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          className={`h-full ${percent > 70 ? 'bg-rose-500' : percent > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
      </div>
    </div>
  );
}

function ProfileItem({ label, value }: any) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function CoverageItem({ label, description }: any) {
  return (
    <li className="flex gap-3">
      <div className="shrink-0 mt-1">
        <CheckCircle size={14} className="text-emerald-500" />
      </div>
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </li>
  );
}

function AdminStat({ label, value }: any) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function RiskGauge({ score }: { score: number }) {
  const color = score > 70 ? '#f43f5e' : score > 40 ? '#f59e0b' : '#10b981';
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-slate-800"
        />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          stroke={color}
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{score}</span>
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Risk</span>
      </div>
    </div>
  );
}

function AIRiskExplanation({ riskMetrics }: any) {
  const factors = [
    { label: 'Rain Level', value: riskMetrics.weather, max: 20, unit: 'mm', icon: <CloudRain size={14} /> },
    { label: 'AQI Level', value: riskMetrics.aqi, max: 300, unit: '', icon: <Wind size={14} /> },
    { label: 'Traffic Congestion', value: riskMetrics.traffic, max: 100, unit: '%', icon: <Car size={14} /> },
    { label: 'Curfew Status', value: riskMetrics.curfew ? 1 : 0, max: 1, unit: '', icon: <Shield size={14} /> },
  ];

  return (
    <div className="bg-slate-950/50 rounded-xl p-5 border border-slate-800/50">
      <div className="flex items-center gap-2 mb-4 text-blue-400">
        <Zap size={16} />
        <span className="text-xs font-bold uppercase tracking-wider">AI-based Activity Estimation</span>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Instead of invasive direct tracking, PayFlux uses environmental proxy signals to estimate delivery activity. 
        When the <strong>Activity Score</strong> drops below 50%, a disruption is automatically detected and claims are processed.
      </p>
      <div className="space-y-4">
        {factors.map((f, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                {f.icon}
                <span>{f.label}</span>
              </div>
              <span className="font-bold text-slate-200">{f.value.toFixed(1)}{f.unit}</span>
            </div>
            <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(f.value / f.max) * 100}%` }}
                className="h-full bg-blue-500/50"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTimeline({ claims, riskMetrics }: any) {
  // Combine claims and some simulated environmental events
  const events = [
    ...claims.map((c: any) => ({
      id: c.id,
      type: 'claim',
      title: 'Claim Triggered',
      description: c.triggerType,
      amount: c.amount,
      timestamp: c.timestamp?.toDate() || new Date(),
      icon: <Zap size={14} className="text-amber-500" />
    })),
    // Add a "Payment Completed" event for each processed claim
    ...claims.filter((c: any) => c.status === 'processed').map((c: any) => ({
      id: `pay-${c.id}`,
      type: 'payment',
      title: 'Payment Completed',
      description: `₹${c.amount} credited to wallet`,
      timestamp: new Date(c.timestamp?.toDate().getTime() + 2000) || new Date(),
      icon: <CheckCircle size={14} className="text-emerald-500" />
    }))
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
        <Clock size={18} className="text-blue-500" />
        Activity Timeline
      </h3>
      <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {events.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm italic">
            Waiting for activity...
          </div>
        ) : (
          <div className="space-y-6 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
            {events.map((event, i) => (
              <motion.div 
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative pl-10"
              >
                <div className="absolute left-0 top-1 w-8 h-8 bg-slate-950 border border-slate-800 rounded-full flex items-center justify-center z-10">
                  {event.icon}
                </div>
                <div className="bg-slate-950/30 border border-slate-800/50 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-bold text-slate-200">{event.title}</h4>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{event.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PayoutModal({ amount, reason, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
      >
        {/* Success Animation Background */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.5, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl"
          />
        </div>

        <div className="relative z-10">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle size={40} className="text-emerald-500" />
          </motion.div>
          
          <h2 className="text-2xl font-bold mb-2">Transaction Successful</h2>
          <p className="text-slate-400 text-sm mb-8">Your disruption claim has been processed and credited instantly.</p>
          
          <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800 mb-8">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Amount Credited</p>
            <h3 className="text-4xl font-black text-emerald-400">₹{amount}</h3>
            <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center text-xs">
              <span className="text-slate-500">Reason</span>
              <span className="text-slate-200 font-bold">{reason}</span>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-50 text-white hover:text-emerald-900 font-bold py-3 rounded-xl transition-all"
          >
            Awesome!
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Registration({ onRegister }: { onRegister: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    deliveryType: 'Bike',
    hourlyIncome: 150
  });

  return (
    <div className="max-w-md mx-auto pt-20 px-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Shield className="text-blue-500" size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PayFlux</h1>
            <p className="text-slate-400 text-sm">Smart Protection for Gig Workers</p>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onRegister(formData); }} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Full Name</label>
            <input 
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">City</label>
            <input 
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              value={formData.city}
              onChange={e => setFormData({...formData, city: e.target.value})}
              placeholder="Mumbai"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Vehicle Type</label>
              <select 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={formData.deliveryType}
                onChange={e => setFormData({...formData, deliveryType: e.target.value})}
              >
                <option>Bike</option>
                <option>Scooter</option>
                <option>Car</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Hourly Income (₹)</label>
              <input 
                type="number"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={formData.hourlyIncome}
                onChange={e => setFormData({...formData, hourlyIncome: parseInt(e.target.value)})}
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors shadow-lg shadow-blue-600/20 mt-4 flex items-center justify-center gap-2"
          >
            <Shield size={18} />
            Sign in with Google & Register
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function SimButton({ onClick, label, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center justify-between w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-3 rounded-xl transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className="text-slate-400 group-hover:text-amber-400 transition-colors">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Zap size={14} className="text-slate-600 group-hover:text-amber-500" />
    </button>
  );
}
