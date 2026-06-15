const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Firebase init
const serviceAccount = {
type: 'service_account',
project_id: process.env.FIREBASE_PROJECT_ID,
private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n'),
client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Submit test
app.post('/api/submit-test', async (req, res) => {
try {
const { testId, answers, submitReason, timeTaken } = req.body;


// Verify token
const token = req.headers.authorization?.split('Bearer ')[1];
if (!token) return res.status(401).json({ error: 'No token' });
const user = await admin.auth().verifyIdToken(token);

// Check already submitted
const existing = await db.collection('submissions')
  .where('userId', '==', user.uid)
  .where('testId', '==', testId)
  .limit(1).get();
if (!existing.empty) return res.json({ success: true, message: 'Already submitted' });

// Get test questions + correct answers
const testDoc = await db.collection('tests').doc(testId).get();
if (!testDoc.exists) return res.status(404).json({ error: 'Test not found' });
const test = testDoc.data();

// Calculate score
let score = 0, totalMarks = 0;
(test.questions || []).forEach(q => {
  const marks = q.marks || 1;
  totalMarks += marks;
  if (answers && answers[q.id] !== undefined && answers[q.id] === q.correctAnswer) {
    score += marks;
  }
});
const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

// Save submission
await db.collection('submissions').add({
  userId: user.uid,
  userEmail: user.email,
  testId,
  answers: answers || {},
  score,
  totalMarks,
  percentage,
  submitReason: submitReason || 'manual',
  timeTaken: timeTaken || 0,
  submittedAt: admin.firestore.FieldValue.serverTimestamp(),
});

res.json({ success: true, score, totalMarks, percentage });


} catch (err) {
console.error('Submit error:', err.message);
res.status(500).json({ error: err.message });
}
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('Server running on port ${PORT}'));