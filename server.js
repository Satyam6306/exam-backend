const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
 
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
 
admin.initializeApp({
  credential: admin.credential.cert({
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});
 
const db = admin.firestore();
 
app.get("/health", function(req, res) {
  res.json({ status: "ok" });
});
 
app.post("/api/submit-test", async function(req, res) {
  try {
    const token = req.headers.authorization && req.headers.authorization.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
 
    const user = await admin.auth().verifyIdToken(token);
    const { testId, answers, submitReason, timeTaken } = req.body;
 
    const existing = await db.collection("submissions")
      .where("userId", "==", user.uid)
      .where("testId", "==", testId)
      .limit(1).get();
 
    if (!existing.empty) return res.json({ success: true, message: "Already submitted" });
 
    const testDoc = await db.collection("tests").doc(testId).get();
    if (!testDoc.exists) return res.status(404).json({ error: "Test not found" });
 
    const test = testDoc.data();
    let score = 0;
    let totalMarks = 0;
 
    if (test.questions) {
      test.questions.forEach(function(q) {
        const marks = q.marks || 1;
        totalMarks += marks;
        if (answers && answers[q.id] !== undefined && answers[q.id] === q.correctAnswer) {
          score += marks;
        }
      });
    }
 
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
 
    await db.collection("submissions").add({
      userId: user.uid,
      userEmail: user.email,
      testId: testId,
      answers: answers || {},
      score: score,
      totalMarks: totalMarks,
      percentage: percentage,
      submitReason: submitReason || "manual",
      timeTaken: timeTaken || 0,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
 
    res.json({ success: true, score: score, totalMarks: totalMarks, percentage: percentage });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
 
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", function() {
  console.log("Server running on port " + PORT);
});
 