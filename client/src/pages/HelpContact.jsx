import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import emailjs from '@emailjs/browser';
import Toast, { useToast } from '../components/ui/Toast';
import { ChevronDown, ChevronUp, Mail, Phone, Send, MessageSquare } from 'lucide-react';

const FAQS = [
  {
    q: "How do I add a new product?",
    a: "Navigate to the Inventory page and click the '+ Add New Product' button. Fill out the product details, including category, pricing, and low stock threshold, then save it to your catalog."
  },
  {
    q: "How do I load stock?",
    a: "On the Inventory page, locate the product and click the 'Load Stock' action (or use the main 'Load Stock' quick action). Enter the quantity loaded, unit price, and any notes, and the system will automatically update your inventory levels and create an audit log."
  },
  {
    q: "How do I invite a team member?",
    a: "Go to Settings > Team. Enter their email address, select a role (Admin or Staff), and click 'Send Invite'. They will receive access to your business once they log in."
  },
  {
    q: "How do I mark a credit bill as paid?",
    a: "Navigate to the Calendar or Sales Analytics page and locate the unpaid credit bill. Click to edit its details and change the status from 'unpaid' to 'paid'. This will instantly reflect in your overall revenue statistics."
  },
  {
    q: "How do I export my data?",
    a: "You can export your inventory and sales data by clicking the 'Export' button located in the top-right corner of the respective Inventory and Sales Analytics pages. The data will be downloaded as a CSV file."
  },
  {
    q: "How do I switch between businesses?",
    a: "Click on your profile avatar in the top-right corner to open the dropdown menu. In the 'Current Business' section, select 'Switch' to view and choose from all the businesses linked to your account."
  }
];

export default function HelpContact() {
  const { user } = useAuth();
  const { displayName, businessData } = useBusiness();
  const { toast, showToast, hideToast } = useToast();

  const [openFaq, setOpenFaq] = useState(0);

  // Form State
  const [f, setF] = useState({
    name: '',
    email: '',
    businessName: '',
    subject: 'General Inquiry',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill user data once loaded
  useEffect(() => {
    setF(prev => ({
      ...prev,
      name: displayName || user?.displayName || '',
      email: user?.email || '',
      businessName: businessData?.businessName || businessData?.name || ''
    }));
  }, [user, displayName, businessData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (f.message.trim().length < 20) {
      showToast('Message must be at least 20 characters long', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await emailjs.send(
        'YOUR_SERVICE_ID',
        'YOUR_TEMPLATE_ID',
        {
          from_name: f.name,
          from_email: f.email,
          business_name: f.businessName,
          subject: f.subject,
          message: f.message,
        },
        'YOUR_PUBLIC_KEY'
      );
      
      showToast("Message sent! We'll get back to you shortly");
      // Reset form (keep name/email)
      setF(prev => ({ ...prev, subject: 'General Inquiry', message: '' }));
    } catch (err) {
      console.error('EmailJS Error:', err);
      showToast('Failed to send. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* TOP HEADER */}
      <div className="glass p-6 rounded-2xl shadow-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center border border-primary-500/30">
          <MessageSquare size={24} className="text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white font-heading">Help & Contact</h1>
          <p className="text-sm text-gray-400 mt-1">Get answers to common questions or reach out to support.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: FAQS */}
        <div className="glass p-6 rounded-2xl shadow-xl h-fit">
          <h2 className="text-lg font-bold text-white mb-6 font-heading flex items-center gap-2">
            <span className="w-8 h-px bg-primary-500/50"></span>
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="bg-gray-900/50 border border-white/5 rounded-xl overflow-hidden transition-colors hover:border-white/10">
                  <button 
                    onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                    className="w-full text-left p-4 flex items-center justify-between focus:outline-none"
                  >
                    <span className={`text-sm font-bold transition-colors ${isOpen ? 'text-primary-400' : 'text-gray-300'}`}>
                      {faq.q}
                    </span>
                    <span className="text-gray-500 shrink-0 ml-4">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-0 text-sm text-gray-400 leading-relaxed border-t border-white/5 bg-gray-900/30 animate-fadeIn">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: CONTACT FORM */}
        <div className="glass p-6 rounded-2xl shadow-xl relative overflow-hidden">
          {/* Subtle gradient background accent */}
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-600/10 blur-3xl rounded-full pointer-events-none"></div>
          
          <div className="relative z-10">
            <h2 className="text-lg font-bold text-white font-heading">Get in Touch</h2>
            <p className="text-xs text-gray-400 mt-1 mb-6">We typically respond within 24 hours</p>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Name</label>
                  <input required value={f.name} onChange={e => setF({...f, name: e.target.value})} className="w-full glass bg-gray-900/50 px-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Email</label>
                  <input required type="email" value={f.email} onChange={e => setF({...f, email: e.target.value})} className="w-full glass bg-gray-900/50 px-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Business Name</label>
                  <input required value={f.businessName} onChange={e => setF({...f, businessName: e.target.value})} className="w-full glass bg-gray-900/50 px-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Subject</label>
                  <select required value={f.subject} onChange={e => setF({...f, subject: e.target.value})} className="w-full glass bg-gray-900/50 px-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors appearance-none cursor-pointer">
                    <option value="General Inquiry">General Inquiry</option>
                    <option value="Bug Report">Bug Report</option>
                    <option value="Feature Request">Feature Request</option>
                    <option value="Billing Issue">Billing Issue</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Message</label>
                <div className="relative">
                  <textarea 
                    required 
                    minLength={20}
                    maxLength={1000}
                    value={f.message} 
                    onChange={e => setF({...f, message: e.target.value})} 
                    placeholder="How can we help you?"
                    className="w-full glass bg-gray-900/50 px-4 py-3 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors resize-none h-32 custom-scrollbar" 
                  />
                  <span className={`absolute bottom-3 right-3 text-[10px] font-bold ${f.message.length > 900 ? 'text-amber-500' : 'text-gray-500'}`}>
                    {f.message.length} / 1000
                  </span>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={submitting}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 transition-all flex items-center justify-center gap-2 mt-2"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Send Message <Send size={16} /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* BOTTOM STRIP: CONTACT INFO */}
      <div className="glass p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-center gap-8 text-sm mt-6">
        <div className="flex items-center gap-3 text-gray-300 group cursor-default">
          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-primary-600/20 transition-colors">
            <Mail size={16} className="text-primary-400" />
          </div>
          <span className="font-medium group-hover:text-white transition-colors">contact@aorbubtijarah.com</span>
        </div>
        <div className="hidden md:block w-px h-6 bg-white/10"></div>
        <div className="flex items-center gap-3 text-gray-300 group cursor-default">
          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-primary-600/20 transition-colors">
            <Phone size={16} className="text-primary-400" />
          </div>
          <span className="font-medium group-hover:text-white transition-colors">+971 XX XXX XXXX</span>
        </div>
      </div>

    </div>
  );
}
