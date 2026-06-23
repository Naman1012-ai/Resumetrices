/**
 * @file atsScorer.js
 * @description Advanced modular service layer to score resumes based on realistic ATS standards.
 * Evaluates: Contact Information, Professional Summary, Education, Technical Skills, Projects,
 * Work Experience, Certifications, Portfolio, Keyword Coverage, and Formatting.
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');

const { SCORE_WEIGHTS } = constants;

// Comprehensive list of industry-relevant technical keywords (unescaped, matched dynamically)
const techKeywords = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust',
  'react', 'angular', 'vue', 'svelte', 'nuxt', 'next.js', 'node.js', 'express', 'django', 'flask',
  'fastapi', 'spring', 'nestjs', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis',
  'supabase', 'firebase', 'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'git', 'github', 
  'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'html', 'css', 'sass', 'tailwind',
  'graphql', 'rest api', 'ci/cd', 'agile', 'scrum', 'linux', 'webpack', 'vite', 'jest', 'pytest',
  'terraform', 'ansible', 'prometheus', 'grafana', 'kafka', 'rabbitmq', 'elasticsearch', 'nginx',
  'figma', 'jira', 'confluence'
];

// Technical action verbs indicating active contribution
const actionVerbs = [
  'led', 'managed', 'developed', 'optimized', 'built', 'implemented', 'designed',
  'created', 'coordinated', 'executed', 'architected', 'spearheaded', 'automated',
  'streamlined', 'reduced', 'increased', 'improved', 'saved', 'scaled', 'initiated',
  'delivered', 'researched', 'debugged', 'mentored', 'migrated', 'refactored', 'deployed',
  'orchestrated', 'analyzed', 'documented'
];

// ATS Action/Competency keywords
const atsCoreKeywords = [
  'optimize', 'scale', 'deploy', 'integrate', 'collaborate', 'infrastructure',
  'pipeline', 'architecture', 'database', 'application', 'server', 'testing',
  'deployment', 'monitoring', 'security', 'performance', 'frontend', 'backend'
];

/**
 * Creates a robust regex for a keyword. Handles special characters like ++, .js, #,
 * ensuring correct word boundaries depending on starting/ending character types.
 * @param {string} keyword
 * @returns {RegExp}
 */
const getKeywordRegex = (keyword) => {
  const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
  const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
  return new RegExp(startBoundary + escaped + endBoundary, 'i');
};

/**
 * Scores a resume based on realistic ATS evaluation criteria.
 * @param {string} text - Raw resume text content.
 * @returns {object} - Scored results, including breakdown, explanations, strengths, weaknesses, recommendations, and missingSections.
 */
const scoreResume = (text) => {
  const normalizedText = text || '';
  
  const breakdown = {
    contact: 0,
    summary: 0,
    education: 0,
    skills: 0,
    projects: 0,
    experience: 0,
    certifications: 0,
    portfolio: 0,
    keywords: 0,
    formatting: 0
  };

  const explanations = {
    contact: '',
    summary: '',
    education: '',
    skills: '',
    projects: '',
    experience: '',
    certifications: '',
    portfolio: '',
    keywords: '',
    formatting: ''
  };

  const strengths = [];
  const weaknesses = [];
  const recommendations = [];

  // Date and chronological indicators (regex to detect year ranges)
  const dateRangeRegex = /(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now)/i;
  const singleDateRegex = /\b(?:19|20)\d{2}\b/i;

  // ----------------------------------------------------
  // 1. Contact Information (Max 10)
  // ----------------------------------------------------
  const maxContact = SCORE_WEIGHTS.contact;
  let contactScore = 0;
  
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(normalizedText);
  // Phone regex: matches typical local and international formats
  const hasPhone = /(?:\+?[0-9]{1,4}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/.test(normalizedText);
  const hasLocation = /location|address|zip|([A-Z][a-zA-Z\s]+,\s*[A-Z]{2,})/i.test(normalizedText);
  const hasLinkedIn = /linkedin\.com/i.test(normalizedText);

  const contactDeductions = [];
  if (hasEmail) contactScore += (maxContact / 4); else contactDeductions.push('Email address');
  if (hasPhone) contactScore += (maxContact / 4); else contactDeductions.push('Phone number');
  if (hasLocation) contactScore += (maxContact / 4); else contactDeductions.push('Location details');
  if (hasLinkedIn) contactScore += (maxContact / 4); else contactDeductions.push('LinkedIn profile link');

  breakdown.contact = Math.round(contactScore);
  if (contactScore === maxContact) {
    strengths.push('Complete contact information provided (Email, Phone, Location, and LinkedIn).');
    explanations.contact = 'Awarded full points for providing all essential contact coordinates.';
  } else {
    weaknesses.push(`Missing essential contact elements: ${contactDeductions.join(', ')}.`);
    recommendations.push(`Add your missing contact information: ${contactDeductions.join(', ')}.`);
    explanations.contact = `Deducted points because of missing: ${contactDeductions.join(', ')}.`;
  }

  // ----------------------------------------------------
  // 2. Professional Summary (Max 10)
  // ----------------------------------------------------
  const maxSummary = SCORE_WEIGHTS.summary;
  const hasSummaryHeader = /summary|objective|profile|about me|professional summary/i.test(normalizedText);
  
  if (!hasSummaryHeader) {
    breakdown.summary = 0;
    weaknesses.push('No professional summary or objective statement detected.');
    recommendations.push('Create a concise "Professional Summary" at the top of your resume to state your core skills and career objectives.');
    explanations.summary = 'Deducted all points because no summary/objective section header was found.';
  } else {
    const wordCount = normalizedText.split(/\s+/).length;
    if (wordCount < 100) {
      breakdown.summary = Math.round(maxSummary / 2);
      weaknesses.push('Professional summary appears brief or lacks detail.');
      recommendations.push('Expand your summary to 3-4 lines highlighting your key achievements, skills, and value proposition.');
      explanations.summary = 'Awarded partial points. A summary section is present, but it is brief and lacks depth.';
    } else {
      breakdown.summary = maxSummary;
      strengths.push('Includes a well-structured professional summary section.');
      explanations.summary = 'Awarded full points for a detailed and standard professional summary.';
    }
  }

  // ----------------------------------------------------
  // 3. Education (Max 10)
  // ----------------------------------------------------
  const maxEducation = SCORE_WEIGHTS.education;
  const hasEducationHeader = /education|academic|degree|university|college|school/i.test(normalizedText);
  const hasDegreeKeywords = /bachelor|master|phd|b\.s|m\.s|b\.tech|m\.tech|b\.a|m\.a|bsc|msc|gpa/i.test(normalizedText);

  if (!hasEducationHeader) {
    breakdown.education = 0;
    weaknesses.push('Missing "Education" section.');
    recommendations.push('Add an "Education" section outlining your degrees, major, university, and graduation year.');
    explanations.education = 'Deducted all points because no Education section was found.';
  } else if (!hasDegreeKeywords) {
    breakdown.education = Math.round(maxEducation / 2);
    weaknesses.push('Education section is present but lacks degree keywords (e.g. Bachelor, Master).');
    recommendations.push('Clearly specify your degree title (e.g., Bachelor of Science in Computer Science) in the Education section.');
    explanations.education = 'Awarded partial points. The section exists, but specific degree levels or academic credentials were not detected.';
  } else {
    breakdown.education = maxEducation;
    
    // Check for dates in education to ensure chronology
    const hasEdDate = dateRangeRegex.test(normalizedText) || singleDateRegex.test(normalizedText);
    if (!hasEdDate) {
      breakdown.education -= 2;
      weaknesses.push('Missing graduation dates or timelines in the Education section.');
      recommendations.push('Add completion or expected graduation years for all listed academic degrees.');
      explanations.education = 'Deducted 2 points for missing graduation dates/years.';
    } else {
      strengths.push('Well-defined Education section with academic credentials and timelines.');
      explanations.education = 'Awarded full points for a clear Education section with degree and chronological information.';
    }
  }

  // ----------------------------------------------------
  // 4. Technical Skills (Max 15)
  // ----------------------------------------------------
  const maxSkills = SCORE_WEIGHTS.skills;
  const hasSkillsHeader = /skills|technologies|languages|frameworks|tools|competencies/i.test(normalizedText);
  let matchedSkillsCount = 0;
  const matchedSkillsList = [];

  techKeywords.forEach(keyword => {
    const regex = getKeywordRegex(keyword);
    if (regex.test(normalizedText)) {
      matchedSkillsCount++;
      matchedSkillsList.push(keyword);
    }
  });

  if (!hasSkillsHeader) {
    breakdown.skills = 0;
    weaknesses.push('No dedicated "Skills" or "Technologies" section detected.');
    recommendations.push('Create a dedicated "Skills" section to help ATS scanners index your technical proficiencies.');
    explanations.skills = 'Deducted all points because no dedicated Skills section header was found.';
  } else {
    if (matchedSkillsCount >= 15) {
      breakdown.skills = maxSkills;
      strengths.push(`Excellent technical skill keyword density (${matchedSkillsCount} skills detected).`);
      explanations.skills = `Awarded 15 points. Found strong tech keywords density: ${matchedSkillsList.slice(0, 8).join(', ')}, etc.`;
    } else if (matchedSkillsCount >= 8) {
      breakdown.skills = Math.round(maxSkills * 0.75);
      recommendations.push('List more technical skills, languages, frameworks, or databases relevant to your target industry to increase keyword density.');
      explanations.skills = `Awarded 11 points. Dedicated section present, but keyword density is average (${matchedSkillsCount} skills found).`;
    } else if (matchedSkillsCount >= 3) {
      breakdown.skills = Math.round(maxSkills * 0.45);
      weaknesses.push('Low technical skill keyword density.');
      recommendations.push('Significantly expand your technical skills catalog to align with target role requirements.');
      explanations.skills = `Awarded 7 points. Found only a few technical keywords: ${matchedSkillsList.join(', ')}.`;
    } else {
      breakdown.skills = Math.round(maxSkills * 0.2);
      weaknesses.push('Technical skills section is empty or contains almost no recognizable developer keywords.');
      recommendations.push('Detail specific technologies (e.g. Python, SQL, Git) rather than generic competencies in your skills section.');
      explanations.skills = 'Awarded 3 points. Dedicated section header exists, but almost no standard tech keywords were scanned.';
    }
  }

  // ----------------------------------------------------
  // 5. Projects (Max 20)
  // ----------------------------------------------------
  const maxProjects = SCORE_WEIGHTS.projects;
  const hasProjectsHeader = /projects|personal projects|academic projects|portfolio/i.test(normalizedText);
  let projectsScore = 0;
  const projectExplanations = [];

  if (!hasProjectsHeader) {
    breakdown.projects = 0;
    weaknesses.push('Missing "Projects" section.');
    recommendations.push('Add a "Projects" section detailing 2-3 technical developments, outlining technology stacks and your individual contributions.');
    explanations.projects = 'Deducted all points because no Projects section was found.';
  } else {
    projectsScore += 4; // Section presence
    projectExplanations.push('Projects section present (+4)');

    // Estimate projects text block
    const projectsIndex = normalizedText.toLowerCase().search(/projects|personal projects|academic projects/);
    const subsequentIndex = normalizedText.toLowerCase().slice(projectsIndex + 10).search(/experience|education|skills|certifications|references/);
    const projectsText = subsequentIndex !== -1 
      ? normalizedText.slice(projectsIndex, projectsIndex + 10 + subsequentIndex)
      : normalizedText.slice(projectsIndex);

    // Number of projects check
    if (projectsText.length > 400) {
      projectsScore += 4;
      projectExplanations.push('Multiple project descriptions detected (+4)');
    } else {
      projectsScore += 2;
      projectExplanations.push('Brief projects description (+2)');
      weaknesses.push('Project descriptions are brief or indicate fewer than 2 distinct projects.');
      recommendations.push('Expand your project descriptions to include at least 2-3 detailed projects.');
    }

    // Technologies mentioned in projects
    let projTechCount = 0;
    techKeywords.forEach(keyword => {
      if (getKeywordRegex(keyword).test(projectsText)) projTechCount++;
    });
    if (projTechCount >= 4) {
      projectsScore += 4;
      projectExplanations.push('Technologies details listed (+4)');
    } else {
      recommendations.push('Mention the exact technologies and frameworks used inside each project description.');
    }

    // Quantified Achievements / Metrics check in projects
    const hasMetrics = /(?:\d+%\s*|\$\d+|\d+\s*x\s*|reduced|optimized|improved|increased|saved|sped)/i.test(projectsText);
    if (hasMetrics) {
      projectsScore += 4;
      projectExplanations.push('Quantified achievements/metrics found (+4)');
      strengths.push('Projects list contains quantifiable impact metrics.');
    } else {
      recommendations.push('Quantify the impact of your projects (e.g., "sped up database queries by 20%" or "grew active users to 500+").');
    }

    // Project description complexity based on length
    if (projectsText.length > 700) {
      projectsScore += 4;
      projectExplanations.push('High description complexity (+4)');
    } else {
      recommendations.push('Write comprehensive descriptions for your projects, detailing the problem solved, implementation, and results.');
    }

    breakdown.projects = projectsScore;
    explanations.projects = projectExplanations.join(', ') + '.';
  }

  // ----------------------------------------------------
  // 6. Experience (Max 15)
  // ----------------------------------------------------
  const maxExperience = SCORE_WEIGHTS.experience;
  const hasExperienceHeader = /experience|work experience|employment|history|internship|professional experience/i.test(normalizedText);
  let experienceScore = 0;
  const experienceExplanations = [];

  if (!hasExperienceHeader) {
    breakdown.experience = 0;
    weaknesses.push('Missing "Work Experience" section.');
    recommendations.push('Add a "Work Experience" section detailing professional employment history, internships, or freelance roles.');
    explanations.experience = 'Deducted all points because no Experience section was found.';
  } else {
    experienceScore += 4; // Presence
    experienceExplanations.push('Experience section present (+4)');

    // Estimate experience section text
    const expIndex = normalizedText.toLowerCase().search(/experience|work experience|employment|professional experience/);
    const subIndex = normalizedText.toLowerCase().slice(expIndex + 12).search(/education|projects|skills|certifications|references/);
    const expText = subIndex !== -1 
      ? normalizedText.slice(expIndex, expIndex + 12 + subIndex)
      : normalizedText.slice(expIndex);

    // Action verbs check
    let verbCount = 0;
    actionVerbs.forEach(verb => {
      if (getKeywordRegex(verb).test(expText)) verbCount++;
    });

    if (verbCount >= 5) {
      experienceScore += 4;
      experienceExplanations.push('Strong action verbs usage (+4)');
    } else {
      recommendations.push('Begin your experience bullet points with strong technical action verbs (e.g. Developed, Orchestrated, Optimized).');
    }

    // Detail check
    if (expText.length > 500) {
      experienceScore += 4;
      experienceExplanations.push('Highly detailed work descriptions (+4)');
      strengths.push('Highly descriptive professional experience bullet points.');
    } else {
      recommendations.push('Detail your responsibilities and concrete technical tasks for each of your professional roles.');
    }

    // Chronology and Date Ranges validation
    const hasTimeline = dateRangeRegex.test(expText);
    if (hasTimeline) {
      experienceScore += 3;
      experienceExplanations.push('Chronological timeline verified (+3)');
    } else {
      weaknesses.push('Incomplete dates or missing employment timeline in Work Experience.');
      recommendations.push('Ensure every job listing includes the start and end dates (Month/Year) to confirm your professional timeline.');
      explanations.experience = 'Deducted 3 points for missing or incomplete employment timelines.';
    }

    // Quantified impact metrics in experience section (SaaS requirement)
    const hasExpMetrics = /(?:\d+%\s*|\$\d+|\d+\s*x\s*|reduced|optimized|improved|increased|saved|sped)/i.test(expText);
    if (!hasExpMetrics) {
      experienceScore = Math.max(0, experienceScore - 2);
      weaknesses.push('Experience accomplishments are task-based rather than outcome-based (no metrics found).');
      recommendations.push('Add quantified metrics in your job descriptions (e.g., "Reduced server response time by 40%" or "Led team of 5 developers").');
    }

    breakdown.experience = experienceScore;
    explanations.experience = experienceExplanations.join(', ') + '.';
  }

  // ----------------------------------------------------
  // 7. Certifications (Max 5)
  // ----------------------------------------------------
  const maxCertifications = SCORE_WEIGHTS.certifications;
  const hasCertifications = /certifications|certified|certificate|credentials|licenses/i.test(normalizedText);
  
  if (!hasCertifications) {
    breakdown.certifications = 0;
    weaknesses.push('No professional certifications listed.');
    recommendations.push('Add industry-relevant certifications (e.g. AWS Certified, Google Cloud Associate, Oracle Java, etc.) to showcase continuous learning.');
    explanations.certifications = 'Deducted all points because no certifications were detected.';
  } else {
    const certMatches = normalizedText.match(/aws|google|certified|associate|microsoft|comptia|oracle|scrum|cisco|coursera|udemy/gi);
    const certCount = certMatches ? new Set(certMatches.size).size : 1;
    
    if (certCount >= 2) {
      breakdown.certifications = maxCertifications;
      strengths.push('Multiple professional certifications listed.');
      explanations.certifications = 'Awarded full points for listing multiple industry-standard credentials.';
    } else {
      breakdown.certifications = Math.round(maxCertifications * 0.6);
      explanations.certifications = 'Awarded 3 points. A certification was detected, but listing multiple can increase value.';
    }
  }

  // ----------------------------------------------------
  // 8. GitHub & Portfolio Presence (Max 5)
  // ----------------------------------------------------
  const maxPortfolio = SCORE_WEIGHTS.portfolio;
  let portfolioScore = 0;
  const portfolioExplanations = [];

  const hasGithub = /github\.com/i.test(normalizedText);
  const hasPortfolioLink = /portfolio|personal website|behance\.net|dribbble\.com/i.test(normalizedText) || 
                          (/www\.[a-z0-9-]+\.[a-z]{2,}/i.test(normalizedText) && !/github\.com|linkedin\.com|google\.com/i.test(normalizedText));

  if (hasGithub) {
    portfolioScore += (maxPortfolio / 2);
    portfolioExplanations.push('GitHub linked (+2.5)');
    strengths.push('Active developer footprint with GitHub linked.');
  } else {
    weaknesses.push('Missing link to a GitHub profile.');
    recommendations.push('Add your GitHub profile link near your email address to showcase your active project repositories.');
  }

  if (hasPortfolioLink) {
    portfolioScore += (maxPortfolio / 2);
    portfolioExplanations.push('Portfolio/website linked (+2.5)');
    strengths.push('Personal portfolio or customized domain linked.');
  } else {
    weaknesses.push('Missing personal portfolio or website link.');
    recommendations.push('Create and link a personal portfolio page to host visual designs, case studies, and live demo links.');
  }

  breakdown.portfolio = Math.round(portfolioScore);
  if (portfolioScore === maxPortfolio) {
    explanations.portfolio = 'Awarded full points for linking both GitHub and a personal portfolio website.';
  } else if (portfolioScore > 0) {
    explanations.portfolio = portfolioExplanations.join(', ') + '.';
  } else {
    explanations.portfolio = 'Deducted all points because neither GitHub nor a personal website link was detected.';
  }

  // ----------------------------------------------------
  // 9. ATS Keyword Coverage (Max 5)
  // ----------------------------------------------------
  const maxKeywords = SCORE_WEIGHTS.keywords;
  let matchedCoreKeywords = 0;
  atsCoreKeywords.forEach(keyword => {
    if (getKeywordRegex(keyword).test(normalizedText)) matchedCoreKeywords++;
  });

  if (matchedCoreKeywords >= 7) {
    breakdown.keywords = maxKeywords;
    strengths.push('Excellent integration of standard ATS action/competency keywords.');
    explanations.keywords = 'Awarded full points. The resume contains strong ATS-friendly systems terminology.';
  } else if (matchedCoreKeywords >= 4) {
    breakdown.keywords = Math.round(maxKeywords * 0.6);
    explanations.keywords = 'Awarded 3 points. Found average core keyword density. Try adding terms like: deploy, scale, integrate.';
  } else {
    breakdown.keywords = Math.round(maxKeywords * 0.2);
    weaknesses.push('Minimal core ATS system keywords detected.');
    recommendations.push('Integrate standard operational/architecture keywords (e.g. infrastructure, deploy, monitor, scale, optimize) within descriptions.');
    explanations.keywords = 'Awarded 1 point. Found almost no core operational keywords.';
  }

  // ----------------------------------------------------
  // 10. Structure & Formatting (Max 5)
  // ----------------------------------------------------
  const maxFormatting = SCORE_WEIGHTS.formatting;
  let headingsCount = 0;
  if (hasEducationHeader) headingsCount++;
  if (hasSkillsHeader) headingsCount++;
  if (hasProjectsHeader) headingsCount++;
  if (hasExperienceHeader) headingsCount++;

  if (headingsCount === 4) {
    breakdown.formatting = maxFormatting;
    strengths.push('Excellent resume structure with standard section headings.');
    explanations.formatting = 'Awarded full points for standard section headings and balanced document layout.';
  } else if (headingsCount === 3) {
    breakdown.formatting = Math.round(maxFormatting * 0.6);
    explanations.formatting = 'Awarded 3 points. Missing one standard header section (Education, Skills, Experience, or Projects).';
  } else {
    breakdown.formatting = Math.round(maxFormatting * 0.2);
    weaknesses.push('Poor resume section organization.');
    recommendations.push('Organize your resume sections using only standard headers: "Education", "Technical Skills", "Work Experience", and "Projects".');
    explanations.formatting = 'Awarded 1 point. Missing multiple standard section headers.';
  }

  // Calculate Overall Score
  const overallScore = Object.values(breakdown).reduce((sum, current) => sum + current, 0);

  // Collect missing sections for the UI
  const missingSections = [];
  if (!hasSummaryHeader) missingSections.push('Professional Summary');
  if (!hasEducationHeader) missingSections.push('Education');
  if (!hasSkillsHeader) missingSections.push('Technical Skills');
  if (!hasProjectsHeader) missingSections.push('Projects');
  if (!hasExperienceHeader) missingSections.push('Work Experience');
  if (!hasCertifications) missingSections.push('Certifications');
  if (!hasGithub) missingSections.push('GitHub Profile');
  if (!hasLinkedIn) missingSections.push('LinkedIn Profile');

  logger.info('ATSScorer', `Evaluated resume. Overall Score: ${overallScore}/100.`);

  return {
    overallScore,
    breakdown,
    explanations,
    strengths,
    weaknesses,
    recommendations,
    missingSections
  };
};

module.exports = {
  scoreResume
};
