import { Card } from '../components/ui/Card';
import { Mail, Phone, MessageSquare, ExternalLink, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const faqs = [
  { q: "How do I edit or delete an entry?", a: "Go to the relevant page (e.g., Profit Optimization), find the entry in the table, and click 'Edit' or 'Delete'. You will be prompted to enter the master password (default: 'edit123') to confirm the action." },
  { q: "How is the profit margin calculated?", a: "Profit margin is calculated as ((Revenue - Cost) / Revenue) * 100. It represents the percentage of revenue that you keep as profit." },
  { q: "What does the Sales Velocity mean?", a: "Sales velocity shows the average quantity of a product sold per day, based on the days that product actually had sales recorded." },
  { q: "Can I export my data?", a: "Data export functionality (CSV/PDF) is coming in a future update. For now, all data is securely stored in your browser or linked Firebase account." }
];

export default function HelpContact() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Help & Contact</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Get support and find answers to common questions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Frequently Asked Questions</h3>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden transition-colors">
                  <button 
                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                    className="w-full flex items-center justify-between p-4 text-left bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-800 dark:text-white">{faq.q}</span>
                    <ChevronDown size={18} className={`text-gray-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openFaq === i && (
                    <div className="p-4 bg-white dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Send us a message</h3>
            <form className="space-y-4" onSubmit={e => e.preventDefault()}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Your Name</label>
                  <input className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary-500 transition-all" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Subject</label>
                  <input className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary-500 transition-all" placeholder="How can we help?" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Message</label>
                <textarea rows="4" className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 transition-all resize-none" placeholder="Describe your issue in detail..."></textarea>
              </div>
              <button type="submit" className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
                <MessageSquare size={16} /> Send Message
              </button>
            </form>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-4">
          <Card className="bg-primary-600 text-white border-none">
            <h3 className="font-semibold mb-2">Premium Support</h3>
            <p className="text-sm text-primary-100 mb-4">Get faster response times and dedicated account management with our premium plan.</p>
            <button className="w-full bg-white text-primary-600 py-2 rounded-xl text-sm font-bold hover:bg-primary-50 transition-colors">
              Upgrade Now
            </button>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Contact Info</h3>
            <div className="space-y-4">
              <a href="mailto:support@aorbub.com" className="flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">Email Us</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">support@aorbub.com</p>
                </div>
              </a>
              <a href="tel:+971501234567" className="flex items-start gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 group-hover:bg-green-100 dark:group-hover:bg-green-900/50 transition-colors">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">Call Us</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Mon-Fri, 9am-6pm GST</p>
                </div>
              </a>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Resources</h3>
            <div className="space-y-2 text-sm">
              <a href="#" className="flex items-center justify-between text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                Documentation <ExternalLink size={14} />
              </a>
              <a href="#" className="flex items-center justify-between text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                Video Tutorials <ExternalLink size={14} />
              </a>
              <a href="#" className="flex items-center justify-between text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                API Reference <ExternalLink size={14} />
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
