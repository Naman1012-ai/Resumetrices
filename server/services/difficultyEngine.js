/**
 * @file difficultyEngine.js
 * @description Engine to classify candidate difficulty levels, generate style/topic metadata,
 * adapt categories dynamically, and validate/auto-correct mismatched assignments.
 */

const logger = require('../utils/logger');

/**
 * Generates the expected knowledge areas based on the classified difficulty level.
 * @param {string} difficulty - Beginner, Intermediate, Advanced, Expert
 * @returns {Array<string>} List of knowledge areas
 */
const getExpectedKnowledge = (difficulty) => {
  switch (difficulty) {
    case 'Beginner':
      return [
        'Programming Fundamentals',
        'Syntax & Formatting Rules',
        'Core Language Constructs',
        'Practical Usage',
        'Small Applications'
      ];
    case 'Intermediate':
      return [
        'APIs & Integrations',
        'Debugging & Error Handling',
        'Basic Authentication',
        'Database Schema & Queries',
        'State Management',
        'Code Organization'
      ];
    case 'Advanced':
      return [
        'Performance Optimization',
        'Security Best Practices',
        'Design Decisions & Patterns',
        'System Architecture',
        'Unit & Integration Testing',
        'Scalability Concepts'
      ];
    case 'Expert':
      return [
        'System Trade-offs',
        'Large Scale Distributed Systems',
        'Microservices & Message Queues',
        'Performance Optimization & Caching',
        'Engineering Leadership & Mentoring',
        'Incident Handling & Fault Tolerance'
      ];
    default:
      return ['Programming Fundamentals'];
  }
};

/**
 * Returns dynamic category-specific interview instructions based on difficulty and experience.
 */
const getCategoryAdaptations = (difficulty, experienceLevel) => {
  const adaptations = {
    technical: '',
    projects: '',
    skillGap: '',
    behavioral: '',
    hr: ''
  };

  // 1. Technical Questions Adaptation
  switch (difficulty) {
    case 'Beginner':
      adaptations.technical = 'Explain core concepts, syntax, and basic programming fundamentals.';
      break;
    case 'Intermediate':
      adaptations.technical = 'Implement concepts, build features, structure API routes, and handle database queries.';
      break;
    case 'Advanced':
      adaptations.technical = 'Optimize concepts for scale, identify code bottlenecks, enforce security, and outline testing strategies.';
      break;
    case 'Expert':
      adaptations.technical = 'Design large-scale systems, justify high-level architectural patterns, handle concurrency, and navigate distributed failures.';
      break;
  }

  // 2. Project Questions Adaptation
  switch (difficulty) {
    case 'Beginner':
      adaptations.projects = 'Explain what you built: describe features, database tables, and the basic user flow.';
      break;
    case 'Intermediate':
      adaptations.projects = 'Explain how you built it: detail framework integrations, API designs, authentication, and database schemas.';
      break;
    case 'Advanced':
      adaptations.projects = 'Explain why you built it that way: justify design choices, data modeling decisions, caching, and unit testing coverage.';
      break;
    case 'Expert':
      adaptations.projects = 'Explain alternative architectures: critique system trade-offs, scaling limits, data storage changes, and failure modes.';
      break;
  }

  // 3. Skill Gap Questions Adaptation
  switch (difficulty) {
    case 'Beginner':
      adaptations.skillGap = 'Evaluate basic understanding and conceptual definition of the missing skills.';
      break;
    case 'Intermediate':
      adaptations.skillGap = 'Evaluate practical application, standard code patterns, and basic integration of the missing skills.';
      break;
    case 'Advanced':
      adaptations.skillGap = 'Evaluate production-level scenarios, optimization, testing, and deployment configurations of the missing skills.';
      break;
    case 'Expert':
      adaptations.skillGap = 'Evaluate architecture-level integration, migration paths, trade-offs, and scaling limits of the missing skills.';
      break;
  }

  // 4. Behavioral Questions Adaptation (based on Experience Level)
  switch (experienceLevel) {
    case 'Student':
      adaptations.behavioral = 'Focus on learning mindset, passion, academic challenges, and receiving feedback.';
      break;
    case 'Fresher':
      adaptations.behavioral = 'Focus on transition to industry, self-learning, work ethic, and adaptability.';
      break;
    case 'Junior':
      adaptations.behavioral = 'Focus on team collaboration, executing requirements, and asking for help when blocked.';
      break;
    case 'Mid-Level':
      adaptations.behavioral = 'Focus on project ownership, managing deadlines, resolving blockers independently, and handling feedback.';
      break;
    case 'Senior':
      adaptations.behavioral = 'Focus on engineering leadership, mentoring peers, resolving conflicts, and leading technical direction.';
      break;
    default:
      adaptations.behavioral = 'Focus on ownership and team collaboration.';
  }

  // 5. HR Questions Adaptation (based on Experience Level)
  switch (experienceLevel) {
    case 'Student':
      adaptations.hr = 'Focus on career goals, graduation timelines, and long-term career aspirations.';
      break;
    case 'Fresher':
    case 'Junior':
      adaptations.hr = 'Focus on professional growth, training expectations, and cultural alignment.';
      break;
    case 'Mid-Level':
      adaptations.hr = 'Focus on career progression, work-life balance, and engineering culture fit.';
      break;
    case 'Senior':
      adaptations.hr = 'Focus on long-term leadership vision, building healthy engineering cultures, and strategic alignment.';
      break;
    default:
      adaptations.hr = 'Focus on career growth and cultural alignment.';
  }

  return adaptations;
};

/**
 * Validates the difficulty assignment against candidate experience to prevent inappropriate mappings.
 * Automatically corrects and downgrades/upgrades if there is a mismatch.
 * @param {object} profile - Candidate profile
 * @param {object} metadata - Generated difficulty metadata
 * @returns {object} Validation result { isValid, wasCorrected, originalDifficulty, finalMetadata }
 */
const validateAndCorrectDifficulty = (profile, metadata) => {
  const exp = profile.experienceLevel.value;
  const originalDifficulty = metadata.difficulty;
  let correctedDifficulty = originalDifficulty;
  let wasCorrected = false;

  // Rule 1: Students or Freshers cannot be assigned Expert or Advanced difficulty
  if (exp === 'Student' || exp === 'Fresher') {
    if (originalDifficulty === 'Expert' || originalDifficulty === 'Advanced') {
      correctedDifficulty = 'Intermediate';
      wasCorrected = true;
      logger.warn('DifficultyEngine', `Validation Mismatch: Candidate is a ${exp} but was assigned ${originalDifficulty}. Auto-correcting to Intermediate.`);
    }
  }

  // Rule 2: Seniors cannot be assigned Beginner or Intermediate difficulty
  if (exp === 'Senior') {
    if (originalDifficulty === 'Beginner' || originalDifficulty === 'Intermediate') {
      correctedDifficulty = 'Advanced';
      wasCorrected = true;
      logger.warn('DifficultyEngine', `Validation Mismatch: Candidate is a Senior but was assigned ${originalDifficulty}. Auto-correcting to Advanced.`);
    }
  }

  if (wasCorrected) {
    // Re-generate metadata based on the corrected difficulty
    const adjustedMetadata = {
      difficulty: correctedDifficulty,
      interviewStyle: getInterviewStyle(correctedDifficulty),
      expectedKnowledge: getExpectedKnowledge(correctedDifficulty),
      followupDepth: getFollowupDepth(correctedDifficulty),
      categoryAdaptations: getCategoryAdaptations(correctedDifficulty, exp)
    };
    return {
      isValid: false,
      wasCorrected: true,
      originalDifficulty,
      finalMetadata: adjustedMetadata
    };
  }

  return {
    isValid: true,
    wasCorrected: false,
    originalDifficulty,
    finalMetadata: metadata
  };
};

const getInterviewStyle = (difficulty) => {
  switch (difficulty) {
    case 'Beginner':
      return 'Fundamentals & Syntax Focused';
    case 'Intermediate':
      return 'Implementation Focused';
    case 'Advanced':
      return 'Architecture & Optimization Focused';
    case 'Expert':
      return 'System Design & Trade-offs Focused';
    default:
      return 'Implementation Focused';
  }
};

const getFollowupDepth = (difficulty) => {
  switch (difficulty) {
    case 'Beginner':
      return 1;
    case 'Intermediate':
    case 'Advanced':
      return 2;
    case 'Expert':
      return 3;
    default:
      return 2;
  }
};

/**
 * Classifies difficulty level and generates the internal Adaptive Difficulty metadata.
 * @param {object} profile - Candidate Profile containing experience, depth, complexity
 * @param {number} atsScore - Candidate's ATS Score
 * @returns {object} Difficulty metadata object (difficulty, interviewStyle, expectedKnowledge, followupDepth, categoryAdaptations)
 */
const generateDifficultyMetadata = (profile, atsScore = 0) => {
  logger.info('DifficultyEngine', 'Starting difficulty classification and metadata generation...');

  const exp = profile.experienceLevel.value;
  const depth = profile.technicalDepth.value;
  const complexity = profile.projectComplexity.value;

  // Unknown profile fallback
  if (exp === 'Unknown' || depth === 'Unknown' || complexity === 'Unknown') {
    logger.warn('DifficultyEngine', 'Candidate Profile contains Unknown parameters. Defaulting to Intermediate.');
    const defaultDifficulty = 'Intermediate';
    return {
      difficulty: defaultDifficulty,
      interviewStyle: getInterviewStyle(defaultDifficulty),
      expectedKnowledge: getExpectedKnowledge(defaultDifficulty),
      followupDepth: getFollowupDepth(defaultDifficulty),
      categoryAdaptations: getCategoryAdaptations(defaultDifficulty, 'Mid-Level')
    };
  }

  // Scoring points
  const expPoints = { Student: 1, Fresher: 1.5, Junior: 2, 'Mid-Level': 3, Senior: 5 };
  const depthPoints = { Beginner: 1, Intermediate: 3, Advanced: 5 };
  const complexityPoints = { Academic: 1, Personal: 2, Production: 4, Enterprise: 5 };

  const pExp = expPoints[exp] || 2;
  const pDepth = depthPoints[depth] || 3;
  const pComplexity = complexityPoints[complexity] || 3;
  
  let pAts = 3;
  if (atsScore >= 70) pAts = 5;
  else if (atsScore < 40) pAts = 1;

  // Weighted score calculation
  const totalScore = (pExp * 0.3) + (pDepth * 0.3) + (pComplexity * 0.2) + (pAts * 0.2);
  logger.info('DifficultyEngine', `Score metrics resolved: exp=${pExp}, depth=${pDepth}, comp=${pComplexity}, ats=${pAts}. Total Score: ${totalScore.toFixed(2)}`);

  let difficulty = 'Intermediate';
  if (totalScore < 1.8) {
    difficulty = 'Beginner';
  } else if (totalScore >= 1.8 && totalScore < 3.2) {
    difficulty = 'Intermediate';
  } else if (totalScore >= 3.2 && totalScore < 4.5) {
    difficulty = 'Advanced';
  } else {
    difficulty = 'Expert';
  }

  // Generate draft metadata
  const draftMetadata = {
    difficulty,
    interviewStyle: getInterviewStyle(difficulty),
    expectedKnowledge: getExpectedKnowledge(difficulty),
    followupDepth: getFollowupDepth(difficulty),
    categoryAdaptations: getCategoryAdaptations(difficulty, exp)
  };

  // Validate and correct any mismatching assignments
  const validationResult = validateAndCorrectDifficulty(profile, draftMetadata);
  logger.info('DifficultyEngine', `Difficulty classification complete. Final Difficulty: ${validationResult.finalMetadata.difficulty} (Corrected: ${validationResult.wasCorrected})`);

  return validationResult.finalMetadata;
};

module.exports = {
  generateDifficultyMetadata
};
