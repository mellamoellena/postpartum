const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');

const Consultation = require('../models/Consultation');
const User = require('../models/User');

// @route   POST api/consultations
// @desc    Book a new consultation
// @access  Private
router.post('/', [
  auth,
  [
    check('professional', 'Professional is required').not().isEmpty(),
    check('date', 'Date is required').not().isEmpty(),
    check('duration', 'Duration is required').isNumeric(),
    check('topic', 'Topic is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { professional, date, duration, topic, notes, concerns } = req.body;

    // Check if professional exists and is actually a professional
    const professionalUser = await User.findById(professional);
    if (!professionalUser || professionalUser.role !== 'professional') {
      return res.status(400).json({ message: 'Invalid professional selected' });
    }

    // Check if the selected time slot is available
    const consultationDate = new Date(date);
    const endTime = new Date(consultationDate);
    endTime.setMinutes(endTime.getMinutes() + parseInt(duration));

    const conflictingConsultation = await Consultation.findOne({
      professional,
      status: 'scheduled',
      $or: [
        // Check if new consultation starts during an existing one
        {
          date: { $lte: consultationDate },
          'date.endTime': { $gte: consultationDate }
        },
        // Check if new consultation ends during an existing one
        {
          date: { $lte: endTime },
          'date.endTime': { $gte: endTime }
        },
        // Check if new consultation completely contains an existing one
        {
          date: { $gte: consultationDate },
          'date.endTime': { $lte: endTime }
        }
      ]
    });

    if (conflictingConsultation) {
      return res.status(400).json({ message: 'This time slot is not available' });
    }

    // Create consultation
    const consultation = new Consultation({
      user: req.user.id,
      professional,
      date: consultationDate,
      duration,
      topic,
      notes,
      concerns,
      // Generate a placeholder meeting link (in production would integrate with Zoom/Teams API)
      meetingLink: `https://meet.nurtureandbloom.com/${Date.now()}`
    });

    await consultation.save();
    
    // Populate professional data
    const populatedConsultation = await Consultation.findById(consultation._id)
      .populate('professional', 'firstName lastName');

    res.json(populatedConsultation);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/consultations
// @desc    Get all user's consultations
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const consultations = await Consultation.find({ user: req.user.id })
      .populate('professional', 'firstName lastName')
      .sort({ date: 1 });
    
    res.json(consultations);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/consultations/professional
// @desc    Get all consultations for a professional
// @access  Private (Professional only)
router.get('/professional', auth, async (req, res) => {
  try {
    // Check if user is a professional
    const user = await User.findById(req.user.id);
    if (user.role !== 'professional') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const consultations = await Consultation.find({ professional: req.user.id })
      .populate('user', 'firstName lastName')
      .sort({ date: 1 });
    
    res.json(consultations);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/consultations/:id
// @desc    Get consultation by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate('professional', 'firstName lastName')
      .populate('user', 'firstName lastName');
    
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    // Check if user is authorized to view this consultation
    if (
      consultation.user._id.toString() !== req.user.id && 
      consultation.professional._id.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(consultation);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/consultations/:id
// @desc    Update consultation
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let consultation = await Consultation.findById(req.params.id);
    
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    // Check if user is authorized to update this consultation
    if (
      consultation.user.toString() !== req.user.id && 
      consultation.professional.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // If status is being updated to 'rescheduled', check availability
    if (req.body.status === 'rescheduled' && req.body.date) {
      const consultationDate = new Date(req.body.date);
      const duration = req.body.duration || consultation.duration;
      const endTime = new Date(consultationDate);
      endTime.setMinutes(endTime.getMinutes() + parseInt(duration));

      const conflictingConsultation = await Consultation.findOne({
        _id: { $ne: req.params.id }, // Exclude current consultation
        professional: consultation.professional,
        status: 'scheduled',
        $or: [
          {
            date: { $lte: consultationDate },
            'date.endTime': { $gte: consultationDate }
          },
          {
            date: { $lte: endTime },
            'date.endTime': { $gte: endTime }
          },
          {
            date: { $gte: consultationDate },
            'date.endTime': { $lte: endTime }
          }
        ]
      });

      if (conflictingConsultation) {
        return res.status(400).json({ message: 'This time slot is not available' });
      }
    }

    // Update fields
    const { date, duration, topic, notes, concerns, status } = req.body;

    if (date) consultation.date = date;
    if (duration) consultation.duration = duration;
    if (topic) consultation.topic = topic;
    if (notes) consultation.notes = notes;
    if (concerns) consultation.concerns = concerns;
    if (status) consultation.status = status;

    await consultation.save();

    // Populate related fields
    const populatedConsultation = await Consultation.findById(consultation._id)
      .populate('professional', 'firstName lastName')
      .populate('user', 'firstName lastName');

    res.json(populatedConsultation);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/consultations/:id
// @desc    Delete a consultation
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    // Check if user is authorized to delete this consultation
    if (
      consultation.user.toString() !== req.user.id && 
      consultation.professional.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if consultation is in the past
    if (new Date(consultation.date) < new Date()) {
      return res.status(400).json({ message: 'Cannot delete past consultations' });
    }

    await consultation.remove();
    res.json({ message: 'Consultation removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/consultations/professionals
// @desc    Get all professionals for booking
// @access  Private
router.get('/professionals/list', auth, async (req, res) => {
  try {
    const professionals = await User.find({ role: 'professional' })
      .select('firstName lastName');
    
    res.json(professionals);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;