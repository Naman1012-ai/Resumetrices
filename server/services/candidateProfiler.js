/**
 * @file candidateProfiler.js
 * @description In-memory profiling engine to infer experience level, technical depth,
 * project complexity, and career direction of a candidate from their resume data.
 */

const logger = require('../utils/logger');

// Helper to escape regex
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Helper to build keyword regex
 */
const getKeywordRegex = (keyword) => {
  const escaped = escapeRegExp(keyword);
  const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
  const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
  return new RegExp(startBoundary + escaped + endBoundary, 'i');
};

/**
 * Helper to count unique matches of keywords in a text block
 */
const countMatches = (text, list) => {
  let count = 0;
  list.forEach(item => {
    const regex = getKeywordRegex(item);
    if (regex.test(text)) {
      count++;
    }
  });
  return count;
};

// Lists of technologies associated with different technical depth levels
const advancedTech = [
  'kubernetes', 'docker', 'terraform', 'aws', 'gcp', 'azure', 'ci/cd', 'ansible',
  'jenkins', 'kafka', 'rabbitmq', 'elasticsearch', 'redis', 'graphql', 'serverless',
  'microservices', 'distributed systems', 'pytorch', 'tensorflow', 'keras',
  'mlops', 'langchain', 'huggingface', 'prometheus', 'grafana',
  'system design', 'scalability', 'concurrency', 'multithreading', 'database optimization'
];

const intermediateTech = [
  'react', 'angular', 'vue', 'svelte', 'node', 'express', 'django', 'flask',
  'spring boot', 'nestjs', 'typescript', 'redux', 'tailwind', 'bootstrap',
  'postgresql', 'mysql', 'mongodb', 'firebase', 'sqlite', 'rest api', 'git',
  'github', 'webpack', 'vite', 'sass', 'jquery', 'pandas', 'numpy', 'scikit-learn',
  'opencv'
];

const beginnerTech = [
  'html', 'css', 'javascript', 'python', 'java', 'c++', 'c#', 'php', 'sql',
  'wordpress', 'wix', 'ms office', 'excel', 'powerpoint', 'word'
];

/**
 * Infer the candidate's Experience Level.
 * Possible values: Student, Fresher, Junior, Mid-Level, Senior, Unknown
 */
const inferExperienceLevel = (text, detectedSkills = [], projects = []) => {
  // 1. Detect student indicators
  const studentKeywords = [
    /pursuing/i,
    /current student/i,
    /expected graduation/i,
    /expected completion/i,
    /enrolled in/i,
    /expected to graduate/i,
    /undergrad/i,
    /candidate for bachelor/i,
    /candidate for master/i,
    /class of 202[6-9]/i,
    /graduating in 202[6-9]/i
  ];
  let studentScore = 0;
  studentKeywords.forEach(regex => {
    if (regex.test(text)) studentScore += 2;
  });

  // 2. Years of Experience (YoE) detection
  let directYoE = 0;
  const wordToNum = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15
  };
  const directRegex = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\+?\s*years?(?:\s+of)?\s+experience/gi;
  let match;
  while ((match = directRegex.exec(text)) !== null) {
    const val = match[1].toLowerCase();
    const num = wordToNum[val] ? wordToNum[val] : parseInt(val, 10);
    if (!isNaN(num) && num > directYoE) {
      directYoE = num;
    }
  }

  // 3. Date range extraction from text (work vs education)
  let workYoE = 0;
  let minStartYear = 9999;
  let maxEndYear = 0;
  let hasWorkRanges = false;

  const lines = text.split('\n');
  const dateRegex = /\b(20[0-2]\d|19[8-9]\d)\s*[-–—to\s]+\s*(20[0-2]\d|present|current|now)\b/i;

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    
    // Skip education-related lines for work experience calculation
    const isEduLine = /education|university|college|school|btech|b\.tech|mtech|b\.e|b\.s|bachelor|master|phd|degree|gpa|hsc|ssc|cbse|icse/i.test(lowerLine);
    
    const dateMatch = dateRegex.exec(line);
    if (dateMatch) {
      const startYear = parseInt(dateMatch[1], 10);
      let endYear = 2026; // Current year assumption
      if (!/present|current|now/i.test(dateMatch[2])) {
        endYear = parseInt(dateMatch[2], 10);
      }
      
      const duration = endYear - startYear;
      if (duration >= 0 && duration <= 40) {
        if (isEduLine) {
          if (endYear > 2026) {
            studentScore += 3;
          }
        } else {
          workYoE += duration;
          hasWorkRanges = true;
          if (startYear < minStartYear) minStartYear = startYear;
          if (endYear > maxEndYear) maxEndYear = endYear;
        }
      }
    }
  });

  let spanYoE = 0;
  if (hasWorkRanges && minStartYear !== 9999 && maxEndYear !== 0) {
    spanYoE = maxEndYear - minStartYear;
  }

  const calculatedYoE = Math.max(directYoE, workYoE, spanYoE);

  // Senior indicators
  const seniorTitles = [
    /\bsenior\b/i, /\bsr\.\b/i, /\blead\b/i, /\bprincipal\b/i, /\barchitect\b/i, 
    /\bmanager\b/i, /\bdirector\b/i, /\bvp\b/i, /\bhead\b/i
  ];
  let seniorTitleCount = 0;
  seniorTitles.forEach(regex => {
    if (regex.test(text)) seniorTitleCount++;
  });

  // Junior indicators
  const juniorTitles = [
    /\bjunior\b/i, /\bjr\.\b/i, /\bassociate\b/i, /\bentry\b/i, /\bintern\b/i, /\bco-op\b/i, /\btrainee\b/i
  ];
  let juniorTitleCount = 0;
  juniorTitles.forEach(regex => {
    if (regex.test(text)) juniorTitleCount++;
  });

  // Fresher indicators
  const fresherKeywords = [
    /\bfresher\b/i, /\brecent grad\b/i, /\bnew grad\b/i, /\bentry-level\b/i
  ];
  let fresherScore = 0;
  fresherKeywords.forEach(regex => {
    if (regex.test(text)) fresherScore += 3;
  });

  // If there's no evidence at all, don't guess: return Unknown
  const hasDates = hasWorkRanges || (minStartYear !== 9999);
  const hasDirectYoE = directYoE > 0;
  const hasEducation = /education|university|college|school|degree/i.test(text);
  
  if (!hasDates && !hasDirectYoE && seniorTitleCount === 0 && juniorTitleCount === 0 && studentScore === 0 && fresherScore === 0) {
    return { value: 'Unknown', confidence: 0 };
  }

  // Scored levels:
  let studentWeight = studentScore + (calculatedYoE < 1.5 && juniorTitleCount > 0 ? 3 : 0);
  let fresherWeight = fresherScore + (calculatedYoE === 0 && hasEducation ? 2 : 0) + (calculatedYoE > 0 && calculatedYoE < 1 && juniorTitleCount > 0 ? 1 : 0);
  let juniorWeight = (calculatedYoE >= 1 && calculatedYoE < 3 ? 5 : 0) + juniorTitleCount * 2;
  let midWeight = (calculatedYoE >= 3 && calculatedYoE < 6 ? 5 : 0) + (calculatedYoE >= 1 && seniorTitleCount === 0 && juniorTitleCount === 0 ? 2 : 0);
  let seniorWeight = (calculatedYoE >= 6 ? 6 : 0) + seniorTitleCount * 3 + (calculatedYoE >= 4 && seniorTitleCount > 0 ? 2 : 0);

  // If YoE is explicitly stated or calculated, prioritize it
  if (calculatedYoE > 0) {
    if (calculatedYoE >= 6) {
      seniorWeight += 10;
    } else if (calculatedYoE >= 3) {
      midWeight += 10;
    } else if (calculatedYoE >= 1) {
      juniorWeight += 10;
    } else {
      fresherWeight += 5;
    }
  }

  const weights = [
    { name: 'Student', weight: studentWeight },
    { name: 'Fresher', weight: fresherWeight },
    { name: 'Junior', weight: juniorWeight },
    { name: 'Mid-Level', weight: midWeight },
    { name: 'Senior', weight: seniorWeight }
  ];

  weights.sort((a, b) => b.weight - a.weight);
  const winner = weights[0];

  if (winner.weight === 0) {
    return { value: 'Unknown', confidence: 0 };
  }

  const inferredValue = winner.name;

  // Confidence Calculation
  let baseConfidence = 50;
  if (calculatedYoE > 0 || hasWorkRanges) {
    baseConfidence += 30;
  }
  if (directYoE > 0) {
    baseConfidence += 10;
  }
  if (studentScore >= 2 && inferredValue === 'Student') {
    baseConfidence += 25;
  }
  if (seniorTitleCount > 1 && inferredValue === 'Senior') {
    baseConfidence += 15;
  }

  let confidence = Math.min(98, Math.max(10, baseConfidence));

  // Conflicting signals penalty
  if (inferredValue === 'Senior' && calculatedYoE > 0 && calculatedYoE < 3) {
    confidence -= 30;
  }
  if (inferredValue === 'Student' && calculatedYoE >= 3) {
    confidence -= 25;
  }

  confidence = Math.min(98, Math.max(10, confidence));

  return { value: inferredValue, confidence };
};

/**
 * Infer the candidate's Technical Depth.
 * Possible values: Beginner, Intermediate, Advanced, Unknown
 */
const inferTechnicalDepth = (text, detectedSkills = [], atsScore = 0) => {
  const advCount = countMatches(text, advancedTech) + 
                   (detectedSkills.filter(s => advancedTech.includes(s.toLowerCase())).length);
  const intCount = countMatches(text, intermediateTech) + 
                   (detectedSkills.filter(s => intermediateTech.includes(s.toLowerCase())).length);
  const begCount = countMatches(text, beginnerTech) + 
                   (detectedSkills.filter(s => beginnerTech.includes(s.toLowerCase())).length);

  // If there's no technical evidence at all, return Unknown
  if (advCount === 0 && intCount === 0 && begCount === 0 && atsScore === 0) {
    return { value: 'Unknown', confidence: 0 };
  }

  let advScore = advCount * 2.5;
  let intScore = intCount * 1.5;
  let begScore = begCount * 1.0;

  // Factor in ATS score
  if (atsScore >= 75) {
    advScore += 5;
  } else if (atsScore >= 45) {
    intScore += 4;
  } else if (atsScore > 0) {
    begScore += 3;
  }

  // Decision logic
  let inferredValue = 'Intermediate';
  let confidence = 50;

  if (advScore > intScore && advScore > begScore) {
    inferredValue = 'Advanced';
    const totalScore = advScore + intScore + begScore;
    confidence = Math.min(95, Math.max(30, Math.round((advScore / (totalScore || 1)) * 100)));
  } else if (begScore > advScore && begScore > intScore) {
    inferredValue = 'Beginner';
    const totalScore = advScore + intScore + begScore;
    confidence = Math.min(95, Math.max(30, Math.round((begScore / (totalScore || 1)) * 100)));
  } else {
    inferredValue = 'Intermediate';
    const totalScore = advScore + intScore + begScore;
    confidence = Math.min(95, Math.max(30, Math.round((intScore / (totalScore || 1)) * 100)));
  }

  // Adjust confidence based on score magnitude
  const totalKeywords = advCount + intCount + begCount;
  if (totalKeywords === 0) {
    confidence = 10;
  } else if (totalKeywords > 8) {
    confidence = Math.min(98, confidence + 10);
  }

  return { value: inferredValue, confidence };
};

/**
 * Infer the candidate's Project Complexity.
 * Possible values: Academic, Personal, Production, Enterprise, Unknown
 */
const inferProjectComplexity = (text, projects = [], detectedSkills = []) => {
  const hasProjectKeywords = /project|portfolio|built|developed|created/i.test(text);
  if (projects.length === 0 && !hasProjectKeywords) {
    return { value: 'Unknown', confidence: 0 };
  }

  const entKeywords = [
    'enterprise', 'microservice', 'distributed', 'high availability', 'scalability',
    'kubernetes', 'kafka', 'ci/cd', 'multi-region', 'load balancer', 'concurrency',
    'throughput', 'fault tolerance', 'terraform'
  ];
  const prodKeywords = [
    'deployed', 'stripe', 'payment', 'active users', 'docker', 'monitoring', 'analytics',
    'production', 'hosted on', 'auth', 'jwt', 'rest api', 'database migration', 'redis',
    'postgresql', 'mongodb', 'mysql'
  ];
  const persKeywords = [
    'personal project', 'portfolio', 'clone', 'weather', 'calculator', 'todo', 'to-do',
    'blog', 'hobby', 'netlify', 'vercel', 'github pages', 'localstorage'
  ];
  const acadKeywords = [
    'academic', 'university', 'coursework', 'thesis', 'capstone', 'professor', 'class project',
    'classroom', 'research paper', 'study', 'college', 'final year project'
  ];

  const entCount = countMatches(text, entKeywords);
  const prodCount = countMatches(text, prodKeywords);
  const persCount = countMatches(text, persKeywords);
  const acadCount = countMatches(text, acadKeywords);

  if (entCount === 0 && prodCount === 0 && persCount === 0 && acadCount === 0 && projects.length === 0) {
    return { value: 'Unknown', confidence: 0 };
  }

  let entScore = entCount * 3.0;
  let prodScore = prodCount * 2.0;
  let persScore = persCount * 1.0;
  let acadScore = acadCount * 1.5;

  const maxKeywordScore = Math.max(entScore, prodScore, persScore, acadScore);
  if (projects.length > 0) {
    if (maxKeywordScore > 0) {
      if (maxKeywordScore === entScore) {
        entScore += projects.length * 1.5;
      } else if (maxKeywordScore === prodScore) {
        prodScore += projects.length * 1.5;
      } else if (maxKeywordScore === acadScore) {
        acadScore += projects.length * 1.5;
      } else {
        persScore += projects.length * 1.5;
      }
    } else {
      persScore += projects.length * 1.5;
    }
  }

  let inferredValue = 'Personal';
  let maxScore = Math.max(entScore, prodScore, persScore, acadScore);

  if (maxScore === 0) {
    return { value: 'Unknown', confidence: 0 };
  }

  if (maxScore === entScore) {
    inferredValue = 'Enterprise';
  } else if (maxScore === prodScore) {
    inferredValue = 'Production';
  } else if (maxScore === acadScore) {
    inferredValue = 'Academic';
  } else {
    inferredValue = 'Personal';
  }

  const total = entScore + prodScore + persScore + acadScore;
  let confidence = Math.min(95, Math.max(30, Math.round((maxScore / (total || 1)) * 100)));

  if (projects.length > 0) {
    confidence = Math.min(98, confidence + 10);
  }

  return { value: inferredValue, confidence };
};

/**
 * Infer the candidate's Career Direction.
 * Possible values: Frontend, Backend, Full Stack, AI/ML, Data Science, DevOps, Mobile, Cybersecurity, Other, Unknown
 */
const inferCareerDirection = (targetRole, detectedSkills = [], text = '') => {
  const normalizedRole = targetRole.toLowerCase();

  // Role keyword matching rules
  const roleWeights = {
    Frontend: /front\s*end|ui|ux|css|html|designer/i.test(normalizedRole) ? 15 : 0,
    Backend: /back\s*end|server|systems? engineer|api developer/i.test(normalizedRole) ? 15 : 0,
    'Full Stack': /full\s*stack|fullstack|software engineer|software developer|web developer/i.test(normalizedRole) ? 15 : 0,
    'AI/ML': /ai|ml|machine learning|deep learning|nlp|computer vision|artificial intelligence/i.test(normalizedRole) ? 15 : 0,
    'Data Science': /data scientist|data science|data analyst|data engineer|analytics/i.test(normalizedRole) ? 15 : 0,
    DevOps: /devops|sre|site reliability|cloud engineer|infrastructure|systems admin/i.test(normalizedRole) ? 15 : 0,
    Mobile: /mobile|ios|android|swift|kotlin/i.test(normalizedRole) ? 15 : 0,
    Cybersecurity: /cyber\s*security|security|penetration|infosec/i.test(normalizedRole) ? 15 : 0
  };

  // Tech mappings to career direction
  const skillMappings = {
    Frontend: ['react', 'angular', 'vue', 'html', 'css', 'javascript', 'typescript', 'tailwind', 'sass', 'redux', 'next.js', 'svelte', 'nuxt'],
    Backend: ['node', 'express', 'python', 'django', 'flask', 'java', 'spring', 'go', 'golang', 'sql', 'postgresql', 'mongodb', 'mysql', 'database', 'graphql', 'api', 'rest', 'microservices'],
    'AI/ML': ['python', 'pytorch', 'tensorflow', 'machine learning', 'deep learning', 'nlp', 'computer vision', 'neural', 'llm', 'prompt', 'transformers', 'huggingface', 'langchain'],
    'Data Science': ['python', 'pandas', 'numpy', 'sql', 'tableau', 'statistics', 'analytics', 'powerbi', 'spark', 'hadoop', 'data analysis', 'data science'],
    DevOps: ['docker', 'kubernetes', 'terraform', 'aws', 'gcp', 'azure', 'ci/cd', 'jenkins', 'gitlab', 'ansible', 'sre', 'cloud', 'prometheus', 'grafana'],
    Mobile: ['swift', 'swiftui', 'kotlin', 'android', 'ios', 'react native', 'flutter', 'mobile'],
    Cybersecurity: ['security', 'penetration', 'cryptography', 'network security', 'owasp', 'firewall', 'infosec', 'cybersecurity']
  };

  const scores = {
    Frontend: roleWeights.Frontend,
    Backend: roleWeights.Backend,
    'Full Stack': roleWeights['Full Stack'],
    'AI/ML': roleWeights['AI/ML'],
    'Data Science': roleWeights['Data Science'],
    DevOps: roleWeights.DevOps,
    Mobile: roleWeights.Mobile,
    Cybersecurity: roleWeights.Cybersecurity,
    Other: 0
  };

  const skillsList = detectedSkills.map(s => s.toLowerCase());

  Object.keys(skillMappings).forEach(category => {
    const list = skillMappings[category];
    list.forEach(skill => {
      if (skillsList.includes(skill)) {
        scores[category] += 2.0;
      }
      const regex = getKeywordRegex(skill);
      if (regex.test(text)) {
        scores[category] += 0.5;
      }
    });
  });

  // Cross-domain Full Stack detection
  if (scores.Frontend > 4 && scores.Backend > 4) {
    scores['Full Stack'] += Math.min(scores.Frontend, scores.Backend) * 1.5;
  }

  let inferredValue = 'Unknown';
  let maxScore = 0;

  Object.keys(scores).forEach(category => {
    if (scores[category] > maxScore) {
      maxScore = scores[category];
      inferredValue = category;
    }
  });

  if (maxScore < 2) {
    if (targetRole.trim().length > 0) {
      return { value: 'Other', confidence: 40 };
    }
    return { value: 'Unknown', confidence: 0 };
  }

  let baseConfidence = 50;
  const targetRoleMatched = roleWeights[inferredValue] > 0;
  if (targetRoleMatched) {
    baseConfidence += 35;
  }

  const skillMatchPoints = Math.round(maxScore);
  baseConfidence += Math.min(15, skillMatchPoints);

  const confidence = Math.min(98, Math.max(10, baseConfidence));

  return { value: inferredValue, confidence };
};

/**
 * Builds candidate profile from resume text and other parsed metadata.
 * @param {string} resumeText - Raw resume text content.
 * @param {string} targetRole - Target job role.
 * @param {Array<string>} detectedSkills - Skills parsed or detected in previous steps.
 * @param {Array<string>} missingSkills - Missing skills relative to target role.
 * @param {number} atsScore - Calculated ATS score.
 * @param {Array<string>} projects - List of project names extracted from the resume.
 * @returns {object} The in-memory Candidate Profile.
 */
const buildCandidateProfile = (resumeText, targetRole, detectedSkills = [], missingSkills = [], atsScore = 0, projects = []) => {
  logger.info('CandidateProfiler', 'Starting candidate profiling inference...');

  const normalizedText = (resumeText || '').trim();
  const normalizedRole = (targetRole || '').trim();

  // If the resume text is extremely short or nonexistent, return Unknown for all
  if (normalizedText.length < 100) {
    logger.warn('CandidateProfiler', 'Resume text too short for accurate profiling. Returning Unknown profile.');
    return {
      experienceLevel: { value: 'Unknown', confidence: 0 },
      technicalDepth: { value: 'Unknown', confidence: 0 },
      projectComplexity: { value: 'Unknown', confidence: 0 },
      careerDirection: { value: 'Unknown', confidence: 0 }
    };
  }

  // Define inference results
  const profile = {
    experienceLevel: inferExperienceLevel(normalizedText, detectedSkills, projects),
    technicalDepth: inferTechnicalDepth(normalizedText, detectedSkills, atsScore),
    projectComplexity: inferProjectComplexity(normalizedText, projects, detectedSkills),
    careerDirection: inferCareerDirection(normalizedRole, detectedSkills, normalizedText)
  };

  logger.info('CandidateProfiler', 'Profiling complete:', JSON.stringify(profile));
  return profile;
};

module.exports = {
  buildCandidateProfile
};
