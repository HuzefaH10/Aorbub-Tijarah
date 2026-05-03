import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Aorbub Tijarah API is running' });
});

// NOTE: With the current architecture, Firestore operations are handled
// directly from the client using Firebase Client SDK + onSnapshot listeners.
// The server is set up for future expansion (e.g., reports, PDF export,
// scheduled tasks, admin operations, etc.)

// Placeholder routes for future server-side operations
app.get('/api/entries', (req, res) => {
  res.json({ message: 'Entries are managed via Firestore client SDK' });
});

app.get('/api/products', (req, res) => {
  res.json({ message: 'Products are managed via Firestore client SDK' });
});

app.get('/api/events', (req, res) => {
  res.json({ message: 'Events are managed via Firestore client SDK' });
});

app.listen(PORT, () => {
  console.log(`🚀 Aorbub Tijarah Server running on port ${PORT}`);
});
