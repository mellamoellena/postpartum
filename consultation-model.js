const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ConsultationSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  professional: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  notes: {
    type: String
  },
  concerns: {
    type: String
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'canceled', 'rescheduled'],
    default: 'scheduled'
  },
  meetingLink: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Consultation', ConsultationSchema);