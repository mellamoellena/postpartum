const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SymptomSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['mild', 'moderate', 'severe', 'emergency'],
    required: true
  },
  commonCauses: [{
    type: String
  }],
  recommendedActions: [{
    type: String
  }],
  seekMedicalAttention: {
    type: Boolean,
    required: true
  },
  relatedSymptoms: [{
    type: String
  }],
  category: {
    type: String,
    enum: ['physical', 'emotional', 'breastfeeding', 'newborn', 'other'],
    required: true
  }
});

const SymptomCheckSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  symptoms: [{
    symptom: {
      type: Schema.Types.ObjectId,
      ref: 'Symptom',
      required: true
    },
    severity: {
      type: Number, // 1-10 scale
      required: true
    },
    duration: {
      type: String // "2 days", "1 week", etc.
    }
  }],
  assessment: {
    type: String,
    required: true
  },
  recommendation: {
    type: String,
    required: true
  },
  seekMedicalAttention: {
    type: Boolean,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Symptom = mongoose.model('Symptom', SymptomSchema);
const SymptomCheck = mongoose.model('SymptomCheck', SymptomCheckSchema);

module.exports = { Symptom, SymptomCheck };