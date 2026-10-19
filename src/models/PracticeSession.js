const mongoose = require('mongoose');

const cardResultSchema = new mongoose.Schema({
  flashcardId: String,
  confidence: { type: Number, min: 1, max: 3 }, // 1=low, 2=medium, 3=high
  reviewedAt: { type: Date, default: Date.now },
}, { _id: false });

const practiceSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', required: true },
  results: [cardResultSchema],
  completedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('PracticeSession', practiceSessionSchema);
