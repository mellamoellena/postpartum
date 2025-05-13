const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');

const Webinar = require('../models/Webinar');
const User = require('../models/User');

// @route   GET api/webinars
// @desc    Get all upcoming webinars
// @access  Public
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    
    // Find webinars occurring in the future
    const webinars = await Webinar.find({ date: { $gte: now } })
      .populate('presenter', 'firstName lastName')
      .sort({ date: 1 });
    
    res.json(webinars);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/webinars/all
// @desc    Get all webinars (including past ones)
// @access  Public
router.get('/all', async (req, res) => {
  try {
    const webinars = await Webinar.find()
      .populate('presenter', 'firstName lastName')
      .sort({ date: -1 });
    
    res.json(webinars);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/webinars/recorded
// @desc    Get all recorded webinars
// @access  Public
router.get('/recorded', async (req, res) => {
  try {
    const webinars = await Webinar.find({ 
      isRecorded: true,
      recordingUrl: { $exists: true, $ne: '' }
    })
      .populate('presenter', 'firstName lastName')
      .sort({ date: -1 });
    
    res.json(webinars);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/webinars/tags/:tag
// @desc    Get webinars by tag
// @access  Public
router.get('/tags/:tag', async (req, res) => {
  try {
    const webinars = await Webinar.find({ tags: req.params.tag })
      .populate('presenter', 'firstName lastName')
      .sort({ date: -1 });
    
    res.json(webinars);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/webinars/:id
// @desc    Get webinar by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id)
      .populate('presenter', 'firstName lastName');
    
    if (!webinar) {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    
    res.json(webinar);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/webinars
// @desc    Create a new webinar
// @access  Private (Professional/Admin only)
router.post('/', [
  auth,
  [
    check('title', 'Title is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('date', 'Date is required').not().isEmpty(),
    check('duration', 'Duration is required').isNumeric(),
    check('capacity', 'Capacity is required').isNumeric()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if user is a professional or admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'professional' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to create webinars' });
    }

    const { title, description, date, duration, capacity, tags } = req.body;

    // Create webinar
    const webinar = new Webinar({
      title,
      description,
      presenter: req.user.id,
      date,
      duration,
      capacity,
      tags: tags || []
    });

    await webinar.save();
    
    // Populate presenter info
    const populatedWebinar = await Webinar.findById(webinar._id)
      .populate('presenter', 'firstName lastName');

    res.json(populatedWebinar);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/webinars/:id
// @desc    Update a webinar
// @access  Private (Presenter/Admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);
    
    if (!webinar) {
      return res.status(404).json({ message: 'Webinar not found' });
    }

    // Check if user is the presenter or admin
    if (webinar.presenter.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Update fields
    const { title, description, date, duration, capacity, tags, recordingUrl, isRecorded } = req.body;

    if (title) webinar.title = title;
    if (description) webinar.description = description;
    if (date) webinar.date = date;
    if (duration) webinar.duration = duration;
    if (capacity) webinar.capacity = capacity;
    if (tags) webinar.tags = tags;
    if (recordingUrl) webinar.recordingUrl = recordingUrl;
    if (isRecorded !== undefined) webinar.isRecorded = isRecorded;

    await webinar.save();

    // Populate presenter info
    const populatedWebinar = await Webinar.findById(webinar._id)
      .populate('presenter', 'firstName lastName');

    res.json(populatedWebinar);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/webinars/:id
// @desc    Delete a webinar
// @access  Private (Presenter/Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);
    
    if (!webinar) {
      return res.status(404).json({ message: 'Webinar not found' });
    }

    // Check if user is the presenter or admin
    if (webinar.presenter.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if webinar is in the past
    if (new Date(webinar.date) < new Date() && webinar.registrations.length > 0) {
      return res.status(400).json({ message: 'Cannot delete past webinars with registrations' });
    }

    await webinar.remove();
    res.json({ message: 'Webinar removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/webinars/:id/register
// @desc    Register for a webinar
// @access  Private
router.post('/:id/register', auth, async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);
    
    if (!webinar) {
      return res.status(404).json({ message: 'Webinar not found' });
    }

    // Check if webinar is in the past
    if (new Date(webinar.date) < new Date()) {
      return res.status(400).json({ message: 'Cannot register for past webinars' });
    }

    // Check capacity
    if (webinar.registrations.length >= webinar.capacity) {
      return res.status(400).json({ message: 'Webinar is at full capacity' });
    }

    // Check if user is already registered
    const alreadyRegistered = webinar.registrations.find(
      reg => reg.user.toString() === req.user.id
    );

    if (alreadyRegistered) {
      return res.status(400).json({ message: 'Already registered for this webinar' });
    }

    // Add user to registrations
    webinar.registrations.push({
      user: req.user.id,
      registeredAt: new Date(),
      attended: false
    });

    await webinar.save();
    
    res.json({ message: 'Successfully registered for webinar' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/webinars/:id/register
// @desc    Cancel registration for a webinar
// @access  Private
router.delete('/:id/register', auth, async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);
    
    if (!webinar) {
      return res.status(404).json({ message: 'Webinar not found' });
    }

    // Check if webinar is in the past
    if (new Date(webinar.date) < new Date()) {
      return res.status(400).json({ message: 'Cannot cancel registration for past webinars' });
    }

    // Find user's registration
    const registrationIndex = webinar.registrations.findIndex(
      reg => reg.user.toString() === req.user.id
    );

    if (registrationIndex === -1) {
      return res.status(400).json({ message: 'Not registered for this webinar' });
    }

    // Remove user from registrations
    webinar.registrations.splice(registrationIndex, 1);
    await webinar.save();
    
    res.json({ message: 'Registration canceled successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/webinars/user/registered
// @desc    Get all webinars user is registered for
// @access  Private
router.get('/user/registered', auth, async (req, res) => {
  try {
    const webinars = await Webinar.find({
      'registrations.user': req.user.id
    })
      .populate('presenter', 'firstName lastName')
      .sort({ date: 1 });
    
    res.json(webinars);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/webinars/:id/attendance
// @desc    Mark user as attended (for presenter/admin)
// @access  Private (Presenter/Admin only)
router.post('/:id/attendance', [
  auth,
  [
    check('userId', 'User ID is required').not().isEmpty(),
    check('attended', 'Attendance status is required').isBoolean()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const webinar = await Webinar.findById(req.params.id);
    
    if (!webinar) {
      return res.status(404).json({ message: 'Webinar not found' });
    }

    // Check if user is the presenter or admin
    if (webinar.presenter.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Find user's registration
    const { userId, attended } = req.body;
    const registration = webinar.registrations.find(
      reg => reg.user.toString() === userId
    );

    if (!registration) {
      return res.status(400).json({ message: 'User not registered for this webinar' });
    }

    // Update attendance
    registration.attended = attended;
    await webinar.save();
    
    res.json({ message: 'Attendance updated successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Webinar not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;