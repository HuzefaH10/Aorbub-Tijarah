import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { db } from '../../services/firebase';
import { doc, setDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, ArrowLeft, Package, DollarSign, CheckCircle } from 'lucide-react';

export default function OnboardingFlow() {
  const { user } = useAuth();
  const { userProfile, activeBusinessId, businessData } = useBusiness();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 State
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');

  // Step 2 State
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [lowStock, setLowStock] = useState('5');
  const [productId, setProductId] = useState(null);

  // Step 3 State
  const [qtySold, setQtySold] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  useEffect(() => {
    if (user && userProfile) {
      if (userProfile.onboardingCompleted !== true) {
        setIsVisible(true);
        if (user.displayName && !ownerName) setOwnerName(user.displayName);
        if (businessData?.businessName && !businessName) setBusinessName(businessData.businessName);
      } else {
        setIsVisible(false);
      }
    }
  }, [user, userProfile, businessData]);

  if (!isVisible) return null;

  const markCompleted = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { onboardingCompleted: true });
      setIsVisible(false);
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    }
  };

  const handleSkipSetup = async () => {
    if (window.confirm("Are you sure? You can set up later in Settings.")) {
      await markCompleted();
      navigate('/');
    }
  };

  const handleStep1 = async (e) => {
    e.preventDefault();
    if (!businessName.trim() || !ownerName.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const bizId = activeBusinessId || user.uid;
      await setDoc(doc(db, 'businesses', bizId), {
        businessName,
        name: ownerName,
      }, { merge: true });
      
      // Update user doc as well if needed
      await setDoc(doc(db, 'users', user.uid), {
        businessName,
        displayName: ownerName
      }, { merge: true });
      
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async (e) => {
    e.preventDefault();
    if (!productName.trim() || !qty || !price) {
      setError('Please fill in required product fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const bizId = activeBusinessId || user.uid;
      const docRef = await addDoc(collection(db, `businesses/${bizId}/products`), {
        name: productName,
        stockRemaining: Number(qty),
        sellingPrice: Number(price),
        lowStockThreshold: Number(lowStock) || 5,
        createdAt: serverTimestamp(),
      });
      setProductId(docRef.id);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async (e) => {
    e.preventDefault();
    if (!qtySold || Number(qtySold) <= 0) {
      setError('Please enter a valid quantity.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const bizId = activeBusinessId || user.uid;
      const total = Number(qtySold) * Number(price);
      
      await addDoc(collection(db, `businesses/${bizId}/bills`), {
        items: [{
          id: productId,
          name: productName,
          qty: Number(qtySold),
          price: Number(price),
          total: total
        }],
        subtotal: total,
        netTotal: total,
        paymentMethod,
        status: paymentMethod === 'credit' ? 'unpaid' : 'paid',
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });
      
      // Update product stock
      const newStock = Math.max(0, Number(qty) - Number(qtySold));
      await updateDoc(doc(db, `businesses/${bizId}/products`, productId), {
        stockRemaining: newStock
      });

      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 4) {
      markCompleted();
    }
  }, [step]);

  const handleFinish = async () => {
    navigate('/');
  };

  const variants = {
    initial: (direction) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
    animate: { x: 0, opacity: 1 },
    exit: (direction) => ({ x: direction > 0 ? -50 : 50, opacity: 0 })
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center pt-20 px-4 overflow-y-auto">
      {/* Top Bar */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center max-w-2xl">
        <div className="text-gray-400 font-bold text-sm tracking-widest uppercase">
          Step {step} of 4
        </div>
        {step < 4 && (
          <button onClick={handleSkipSetup} className="text-gray-500 hover:text-white transition-colors text-sm font-semibold flex items-center gap-2">
            Skip entire setup <X size={16} />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-900">
        <div 
          className="h-full bg-primary-500 transition-all duration-500 ease-out"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      <div className="w-full max-w-[480px] relative">
        <AnimatePresence mode="wait" custom={1}>
          
          {step === 1 && (
            <motion.div key="step1" variants={variants} initial="initial" animate="animate" exit="exit" custom={1} className="w-full">
              <h1 className="text-3xl font-bold text-white font-heading mb-2 text-center">Welcome to Aorbub Tijarah</h1>
              <p className="text-gray-400 text-center mb-10">Let's get your business set up in 2 minutes.</p>
              
              <form onSubmit={handleStep1} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Business Name</label>
                  <input 
                    type="text" 
                    value={businessName} 
                    onChange={e => setBusinessName(e.target.value)}
                    required
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none transition-colors"
                    placeholder="E.g. Super Mart"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Name</label>
                  <input 
                    type="text" 
                    value={ownerName} 
                    onChange={e => setOwnerName(e.target.value)}
                    required
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none transition-colors"
                    placeholder="John Doe"
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-primary-600 hover:bg-primary-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {loading ? 'Saving...' : <>Let's Go <ArrowRight size={20} /></>}
                </button>
              </form>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" variants={variants} initial="initial" animate="animate" exit="exit" custom={1} className="w-full">
              <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white mb-6 transition-colors flex items-center gap-2 text-sm font-semibold">
                <ArrowLeft size={16} /> Back
              </button>
              <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-center gap-2">
                <span>✨</span>
                <span>Your 14-day Pro trial has started. All features are unlocked.</span>
              </div>
              <h1 className="text-3xl font-bold text-white font-heading mb-2">Add your first product</h1>
              <p className="text-gray-400 mb-10">You can add more products later in Inventory.</p>
              
              <form onSubmit={handleStep2} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Product Name</label>
                  <input 
                    type="text" 
                    value={productName} 
                    onChange={e => setProductName(e.target.value)}
                    required
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-colors"
                    placeholder="E.g. Wireless Mouse"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quantity in Stock</label>
                    <input 
                      type="number" 
                      value={qty} 
                      onChange={e => setQty(e.target.value)}
                      required
                      min="1"
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-colors"
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Selling Price (AED)</label>
                    <input 
                      type="number" 
                      value={price} 
                      onChange={e => setPrice(e.target.value)}
                      required
                      min="0"
                      step="0.01"
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-colors"
                      placeholder="49.99"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Low Stock Alert Threshold (Optional)</label>
                  <input 
                    type="number" 
                    value={lowStock} 
                    onChange={e => setLowStock(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none transition-colors"
                    placeholder="5"
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                
                <div className="pt-4 flex flex-col items-center gap-4">
                  <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    {loading ? 'Saving...' : <>Add Product <ArrowRight size={20} /></>}
                  </button>
                  <button type="button" onClick={() => setStep(3)} className="text-gray-500 hover:text-white text-sm font-semibold transition-colors">
                    I'll do this later
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" variants={variants} initial="initial" animate="animate" exit="exit" custom={1} className="w-full">
              <button onClick={() => setStep(2)} className="text-gray-500 hover:text-white mb-6 transition-colors flex items-center gap-2 text-sm font-semibold">
                <ArrowLeft size={16} /> Back
              </button>
              <h1 className="text-3xl font-bold text-white font-heading mb-2">Record your first sale</h1>
              <p className="text-gray-400 mb-10">Let's see how easy it is to track revenue.</p>
              
              <form onSubmit={handleStep3} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Product</label>
                  <div className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-gray-400">
                    {productName || "Sample Product"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quantity Sold</label>
                    <input 
                      type="number" 
                      value={qtySold} 
                      onChange={e => setQtySold(e.target.value)}
                      required
                      min="1"
                      max={qty || 100}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Method</label>
                    <select 
                      value={paymentMethod} 
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-colors appearance-none"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="credit">Credit (Unpaid)</option>
                    </select>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex justify-between items-center">
                  <span className="text-green-400 font-bold uppercase tracking-wider text-xs">Total Sale Value</span>
                  <span className="text-xl font-bold text-green-300">
                    ${(Number(qtySold || 0) * Number(price || 0)).toFixed(2)}
                  </span>
                </div>
                
                {error && <p className="text-red-400 text-sm">{error}</p>}
                
                <div className="pt-4 flex flex-col items-center gap-4">
                  <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    {loading ? 'Saving...' : <>Record Sale <ArrowRight size={20} /></>}
                  </button>
                  <button type="button" onClick={() => setStep(4)} className="text-gray-500 hover:text-white text-sm font-semibold transition-colors">
                    I'll do this later
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" variants={variants} initial="initial" animate="animate" exit="exit" custom={1} className="w-full text-center">
              <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={40} />
              </div>
              <h1 className="text-3xl font-bold text-white font-heading mb-2">You're ready to go! 🎉</h1>
              <p className="text-gray-400 mb-10">Your business <strong>{businessName}</strong> is fully set up.</p>
              
              <div className="space-y-3 mb-10">
                <button onClick={() => navigate('/inventory')} className="w-full glass hover:bg-white/5 border border-white/5 rounded-xl p-4 flex items-center gap-4 transition-colors text-left group">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors"><Package size={20} /></div>
                  <div>
                    <h3 className="text-white font-bold text-sm">View My Stock</h3>
                    <p className="text-xs text-gray-500">Check what's running low</p>
                  </div>
                </button>
                <button onClick={() => navigate('/')} className="w-full glass hover:bg-white/5 border border-white/5 rounded-xl p-4 flex items-center gap-4 transition-colors text-left group">
                  <div className="p-2 rounded-lg bg-green-500/20 text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors"><DollarSign size={20} /></div>
                  <div>
                    <h3 className="text-white font-bold text-sm">See Today's P&L</h3>
                    <p className="text-xs text-gray-500">Track your daily performance</p>
                  </div>
                </button>
                <button onClick={() => navigate('/credits')} className="w-full glass hover:bg-white/5 border border-white/5 rounded-xl p-4 flex items-center gap-4 transition-colors text-left group">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors"><CheckCircle size={20} /></div>
                  <div>
                    <h3 className="text-white font-bold text-sm">Record a Credit/Due</h3>
                    <p className="text-xs text-gray-500">Manage what you owe and are owed</p>
                  </div>
                </button>
              </div>

              <button onClick={handleFinish} className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                Go to Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
