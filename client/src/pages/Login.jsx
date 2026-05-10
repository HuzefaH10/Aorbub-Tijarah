import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../services/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState({ field: '', message: '' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const lastUserName = localStorage.getItem('lastUserName');

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleForgotPassword = async () => {
    if (!email) {
      setError({ field: 'email', message: 'Please enter your email first' });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg('Reset link sent to your email');
      setError({ field: '', message: '' });
    } catch (err) {
      setError({ field: 'email', message: 'Failed to send reset email' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError({ field: '', message: '' });
    setMsg('');
    setLoading(true);

    try {
      let userCred;
      if (isSignup) {
        userCred = await signup(email, password);
      } else {
        userCred = await login(email, password);
      }

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      // Fetch user profile to apply theme and save name before navigating
      const userDoc = await getDoc(doc(db, 'users', userCred.user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.displayName || data.name) {
          localStorage.setItem('lastUserName', data.displayName || data.name);
        }
        if (data.theme) {
          localStorage.setItem('app-theme', data.theme);
          const root = document.documentElement;
          root.classList.remove('dark', 'light', 'royal-purple');
          root.removeAttribute('data-theme');
          if (data.theme === 'dark') root.classList.add('dark');
          else if (data.theme === 'royal-purple') {
            root.classList.add('dark', 'royal-purple');
            root.setAttribute('data-theme', 'royal-purple');
          } else {
            root.classList.add('light');
          }
        }
      }

      navigate('/');
    } catch (err) {
      const code = err.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError({ field: 'password', message: 'Wrong password' });
      } else if (code === 'auth/invalid-email' || code === 'auth/user-not-found') {
        setError({ field: 'email', message: 'Invalid email' });
      } else if (code === 'auth/too-many-requests') {
        setError({ field: 'general', message: 'Too many attempts, try again later' });
      } else if (code === 'auth/email-already-in-use') {
        setError({ field: 'email', message: 'Email already registered' });
      } else if (code === 'auth/weak-password') {
        setError({ field: 'password', message: 'Password must be at least 6 characters' });
      } else {
        setError({ field: 'general', message: 'Authentication failed. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-950 overflow-hidden font-sans">
      
      {/* LEFT PANEL (40%) */}
      <div className="hidden lg:flex flex-col justify-between w-[40%] bg-[#0D0D1A] relative animate-fadeIn shadow-2xl z-10 p-12">
        {/* Subtle decorative element - Brand Purple Gradient Mesh */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[20%] w-[140%] h-[140%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary-900/30 via-[#0D0D1A]/10 to-transparent blur-3xl opacity-60"></div>
          <div className="absolute top-[40%] left-[20%] w-[100%] h-[100%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary-700/20 via-transparent to-transparent blur-3xl opacity-40"></div>
        </div>

        <div className="relative z-10 w-full flex flex-col items-center justify-center flex-1 text-center">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold font-heading mb-6 shadow-[0_0_40px_rgba(124,58,237,0.3)] border border-primary-500/50">
            AT
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold text-white font-heading tracking-wide mb-4">
            Aorbub Tijarah
          </h1>
          <p className="text-primary-200/70 text-lg max-w-sm mx-auto font-medium">
            Smart business management for modern traders
          </p>
        </div>

        <div className="relative z-10 text-center">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
            © 2026 Aorbub Tijarah. All rights reserved.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL (60%) */}
      <div className="w-full lg:w-[60%] flex items-center justify-center p-8 bg-gray-950 relative">
        <div className="w-full max-w-[400px] animate-slideInRight">
          
          <div className="mb-10 text-center lg:text-left">
            {/* Mobile Logo Fallback */}
            <div className="lg:hidden w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-white text-xl font-bold font-heading mx-auto mb-6 shadow-lg shadow-primary-600/30">
              AT
            </div>
            
            <h2 className="text-2xl font-bold text-white font-heading">
              {lastUserName && !isSignup ? `Welcome back, ${lastUserName} 👋` : 'Welcome to Aorbub Tijarah'}
            </h2>
            <p className="text-sm text-gray-400 mt-2">
              {isSignup ? 'Create an account to get started' : 'Sign in to continue to your dashboard'}
            </p>
          </div>

          {error.general && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold text-center">
              {error.general}
            </div>
          )}
          
          {msg && (
            <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-bold text-center">
              {msg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail size={18} className="text-gray-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError({ field: '', message: '' }); }}
                  className={`w-full bg-gray-900 border ${error.field === 'email' ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-primary-500'} text-white rounded-xl py-3.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-gray-600`}
                  placeholder="Enter your email"
                />
              </div>
              {error.field === 'email' && <p className="text-xs text-red-400 font-bold mt-1.5">{error.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-500" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError({ field: '', message: '' }); }}
                  className={`w-full bg-gray-900 border ${error.field === 'password' ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-primary-500'} text-white rounded-xl py-3.5 pl-11 pr-12 text-sm outline-none transition-all placeholder:text-gray-600`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error.field === 'password' && <p className="text-xs text-red-400 font-bold mt-1.5">{error.message}</p>}
            </div>

            {!isSignup && (
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-primary-600 focus:ring-primary-500 focus:ring-offset-gray-900 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm font-bold text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[48px] mt-6 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-all shadow-[0_0_20px_rgba(124,58,237,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin text-white/70" />
              ) : (
                isSignup ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="text-center mt-8">
            <button
              onClick={() => { setIsSignup(!isSignup); setError({ field: '', message: '' }); setMsg(''); }}
              className="text-sm text-gray-400 hover:text-white font-medium transition-colors"
            >
              {isSignup ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
