import { db } from '../services/firebase';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, serverTimestamp
} from 'firebase/firestore';

/**
 * Calculate the next occurrence date from a given date and frequency.
 */
function nextOccurrence(dateStr, frequency) {
  const d = new Date(dateStr + 'T12:00:00');
  if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Silently generates new event documents for any recurring event whose
 * next occurrence date has passed and no event already exists for that date.
 */
export async function generateRecurringEvents(businessId) {
  if (!businessId) return;

  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch all recurring events for this business
    const q = query(
      collection(db, 'events'),
      where('businessId', '==', businessId),
      where('recurring.enabled', '==', true)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    // 2. Fetch all existing event dates to prevent duplicates
    const allQ = query(collection(db, 'events'), where('businessId', '==', businessId));
    const allSnap = await getDocs(allQ);
    const existingDates = new Set(allSnap.docs.map(d => d.data().date).filter(Boolean));

    for (const docSnap of snap.docs) {
      const evt = { id: docSnap.id, ...docSnap.data() };
      const frequency = evt.recurring?.frequency;
      if (!frequency || !evt.date) continue;

      const nextDate = nextOccurrence(evt.date, frequency);

      // Only generate if next date is on or before today and not already existing
      if (nextDate <= todayStr && !existingDates.has(nextDate)) {
        // Build new event
        const { id, createdAt, ...rest } = evt;
        const newEvt = {
          ...rest,
          date: nextDate,
          status: 'pending',
          createdAt: serverTimestamp(),
        };

        const newRef = await addDoc(collection(db, 'events'), newEvt);
        existingDates.add(nextDate); // prevent generating twice in same run

        // Update the original event's date to be this nextDate so the chain advances
        await updateDoc(doc(db, 'events', docSnap.id), {
          date: nextDate,
          status: 'pending',
        });

        // Audit log
        try {
          await addDoc(collection(db, 'auditLog'), {
            businessId,
            action: 'Recurring event auto-generated',
            detail: `${evt.title || 'Event'} (${frequency}) → ${nextDate}`,
            module: 'Calendar',
            timestamp: serverTimestamp(),
          });
        } catch {
          // non-critical
        }
      }
    }
  } catch (err) {
    // Silent — never block UI
    console.warn('[recurringEvents] Error:', err);
  }
}
