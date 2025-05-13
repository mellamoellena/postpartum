const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');

const { Symptom, SymptomCheck } = require('../models/Symptom');

// @route   GET api/symptoms
// @desc    Get all symptoms
// @access  Public
router.get('/', async (req, res) => {
  try {
    const symptoms = await Symptom.find().sort({ name: 1 });
    res.json(symptoms);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/symptoms/category/:category
// @desc    Get symptoms by category
// @access  Public
router.get('/category/:category', async (req, res) => {
  try {
    const symptoms = await Symptom.find({ category: req.params.category }).sort({ name: 1 });
    res.json(symptoms);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/symptoms/check
// @desc    Submit symptoms for assessment
// @access  Private
router.post('/check', [
  auth,
  [
    check('symptoms', 'At least one symptom is required').isArray({ min: 1 }),
    check('symptoms.*.symptom', 'Symptom ID is required').not().isEmpty(),
    check('symptoms.*.severity', 'Severity is required').isNumeric()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { symptoms } = req.body;

    // Get actual symptom data
    const symptomIds = symptoms.map(s => s.symptom);
    const symptomData = await Symptom.find({ _id: { $in: symptomIds } });

    if (symptomData.length === 0) {
      return res.status(400).json({ message: 'Invalid symptoms provided' });
    }

    // Determine severity of condition
    let emergencyFound = false;
    let severeFound = false;
    let moderateFound = false;
    
    // Check if any symptoms are emergency or severe
    symptomData.forEach(symptom => {
      if (symptom.severity === 'emergency') emergencyFound = true;
      if (symptom.severity === 'severe') severeFound = true;
      if (symptom.severity === 'moderate') moderateFound = true;
    });

    // Determine if user should seek medical attention
    const seekMedicalAttention = emergencyFound || severeFound;
    
    // Generate assessment based on symptoms
    let assessment = '';
    let recommendation = '';
    
    if (emergencyFound) {
      assessment = 'Your symptoms indicate a potentially serious medical condition that requires immediate attention.';
      recommendation = 'Please seek emergency medical care immediately or call emergency services.';
    } else if (severeFound) {
      assessment = 'Your symptoms may indicate a significant health concern that should be evaluated by a healthcare provider.';
      recommendation = 'Please contact your healthcare provider today for an evaluation.';
    } else if (moderateFound) {
      assessment = 'Your symptom profile suggests a moderate concern that should be monitored closely.';
      recommendation = 'Consider scheduling an appointment with your healthcare provider within the next few days if symptoms persist or worsen.';
    } else {
      assessment = 'Based on the information provided, your symptoms appear to be mild and common during the postpartum period.';
      recommendation = 'Continue to monitor your symptoms and practice self-care. If symptoms worsen or persist beyond 2 weeks, consult with your healthcare provider.';
    }

    // Create and save symptom check
    const symptomCheck = new SymptomCheck({
      user: req.user.id,
      symptoms: symptoms.map(s => ({
        symptom: s.symptom,
        severity: s.severity,
        duration: s.duration || 'Not specified'
      })),
      assessment,
      recommendation,
      seekMedicalAttention
    });

    await symptomCheck.save();

    // Return complete symptom check with detailed symptom information
    const completeCheck = await SymptomCheck.findById(symptomCheck._id)
      .populate('symptoms.symptom');
    
    res.json(completeCheck);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/symptoms/history
// @desc    Get user's symptom check history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const history = await SymptomCheck.find({ user: req.user.id })
      .populate('symptoms.symptom')
      .sort({ createdAt: -1 });
    
    res.json(history);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/symptoms/check/:id
// @desc    Get specific symptom check by ID
// @access  Private
router.get('/check/:id', auth, async (req, res) => {
  try {
    const symptomCheck = await SymptomCheck.findById(req.params.id)
      .populate('symptoms.symptom');
    
    if (!symptomCheck) {
      return res.status(404).json({ message: 'Symptom check not found' });
    }

    // Check if user is authorized to view this check
    if (symptomCheck.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(symptomCheck);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Symptom check not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/symptoms/seed
// @desc    Seed initial symptoms (admin only)
// @access  Private (Admin)
router.post('/seed', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Initial postpartum symptoms seed data
    const seedSymptoms = [
      {
        name: 'Postpartum Bleeding (Heavy)',
        description: 'Heavy vaginal bleeding that soaks through one or more pads per hour for more than 2 hours.',
        severity: 'emergency',
        commonCauses: ['Retained placenta', 'Uterine atony', 'Trauma during delivery'],
        recommendedActions: ['Seek emergency medical care immediately'],
        seekMedicalAttention: true,
        relatedSymptoms: ['Dizziness', 'Weakness', 'Rapid heart rate'],
        category: 'physical'
      },
      {
        name: 'Postpartum Bleeding (Normal)',
        description: 'Normal vaginal discharge (lochia) that changes from red to pink to white over weeks.',
        severity: 'mild',
        commonCauses: ['Normal postpartum recovery'],
        recommendedActions: ['Monitor for changes', 'Use sanitary pads'],
        seekMedicalAttention: false,
        relatedSymptoms: [],
        category: 'physical'
      },
      {
        name: 'Severe Headache',
        description: 'Intense headache that may be accompanied by vision changes.',
        severity: 'severe',
        commonCauses: ['Preeclampsia', 'Hormonal changes', 'Dehydration', 'Lack of sleep'],
        recommendedActions: ['Contact healthcare provider immediately'],
        seekMedicalAttention: true,
        relatedSymptoms: ['Vision changes', 'Swelling', 'Upper abdominal pain'],
        category: 'physical'
      },
      {
        name: 'Breast Engorgement',
        description: 'Swollen, firm, tender breasts as milk comes in.',
        severity: 'moderate',
        commonCauses: ['Milk production', 'Milk stasis'],
        recommendedActions: ['Frequent breastfeeding', 'Cold compresses', 'Gentle massage'],
        seekMedicalAttention: false,
        relatedSymptoms: ['Discomfort', 'Warmth', 'Hardness'],
        category: 'breastfeeding'
      },
      {
        name: 'Mastitis',
        description: 'Breast inflammation often with redness, pain, and flu-like symptoms.',
        severity: 'moderate',
        commonCauses: ['Blocked milk duct', 'Bacterial infection'],
        recommendedActions: ['Continue breastfeeding', 'Contact healthcare provider'],
        seekMedicalAttention: true,
        relatedSymptoms: ['Fever', 'Chills', 'Fatigue', 'Body aches'],
        category: 'breastfeeding'
      },
      {
        name: 'Baby Blues',
        description: 'Mild mood changes, tearfulness in the first two weeks after delivery.',
        severity: 'mild',
        commonCauses: ['Hormonal changes', 'Lack of sleep', 'Adjustment to new role'],
        recommendedActions: ['Rest', 'Accept help', 'Talk about feelings'],
        seekMedicalAttention: false,
        relatedSymptoms: ['Irritability', 'Anxiety', 'Mood swings', 'Crying'],
        category: 'emotional'
      },
      {
        name: 'Postpartum Depression',
        description: 'Persistent feelings of sadness, hopelessness, or overwhelm lasting more than two weeks.',
        severity: 'severe',
        commonCauses: ['Hormonal changes', 'History of depression', 'Difficult delivery', 'Lack of support'],
        recommendedActions: ['Contact healthcare provider', 'Seek counseling'],
        seekMedicalAttention: true,
        relatedSymptoms: ['Loss of interest', 'Changes in appetite', 'Fatigue', 'Thoughts of harming self or baby'],
        category: 'emotional'
      },
      {
        name: 'Perineal Pain',
        description: 'Pain in the area between vagina and rectum following vaginal delivery.',
        severity: 'moderate',
        commonCauses: ['Episiotomy', 'Tearing during delivery'],
        recommendedActions: ['Sitz baths', 'Cold packs', 'Pain medication as prescribed'],
        seekMedicalAttention: false,
        relatedSymptoms: ['Swelling', 'Bruising', 'Discomfort when sitting'],
        category: 'physical'
      },
      {
        name: 'C-Section Incision Pain',
        description: 'Pain at the incision site following cesarean delivery.',
        severity: 'moderate',
        commonCauses: ['Surgical wound healing'],
        recommendedActions: ['Take prescribed pain medication', 'Avoid heavy lifting'],
        seekMedicalAttention: false,
        relatedSymptoms: ['Redness', 'Swelling'],
        category: 'physical'
      },
      {
        name: 'C-Section Infection',
        description: 'Signs of infection at the incision site including increasing pain, redness, warmth, or discharge.',
        severity: 'severe',
        commonCauses: ['Bacterial infection'],
        recommendedActions: ['Contact healthcare provider immediately'],
        seekMedicalAttention: true,
        relatedSymptoms: ['Fever', 'Foul-smelling discharge', 'Increased pain'],
        category: 'physical'
      }
    ];

    // Check if symptoms already exist
    const existingCount = await Symptom.countDocuments();
    if (existingCount > 0) {
      return res.status(400).json({ message: 'Symptoms already seeded' });
    }

    // Insert seed data
    await Symptom.insertMany(seedSymptoms);
    
    res.json({ message: 'Symptoms seeded successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;