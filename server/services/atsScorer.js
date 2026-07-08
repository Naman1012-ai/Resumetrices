/**
 * @file atsScorer.js
 * @description Advanced modular service layer to score resumes based on realistic ATS standards.
 * Evaluates: Contact Information, Resume Structure, Skills, Experience, Projects, Education, Keywords, Achievements.
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');
const rolesConfig = require('../config/rolesConfig');

// Comprehensive list of industry-relevant technical keywords (matched dynamically)
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

const getKeywordRegex = (keyword) => {
  const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const startBoundary = /^\w/.test(keyword) ? '\\b' : '';
  const endBoundary = /\w$/.test(keyword) ? '\\b' : '';
  return new RegExp(startBoundary + escaped + endBoundary, 'i');
};

/**
 * Reusable, null-safe clamping helper function to guarantee
 * all calculated metrics stay strictly within their intended ranges.
 */
const clamp = (value, min, max) => {
  if (value === null || value === undefined || isNaN(value)) return min;
  return Math.max(min, Math.min(max, Number(value)));
};

/**
 * Normalizes skill inputs. Supports both string primitives and key-value objects.
 */
const normalizeSkill = (s) => {
  if (!s) return null;
  if (typeof s === 'string') {
    return { name: s, weight: 1 };
  }
  if (typeof s === 'object' && s.name) {
    return { name: s.name, weight: s.weight !== undefined ? Number(s.weight) : 1 };
  }
  return null;
};

// Comprehensive Semantic Skill Mapping Matrix
const semanticSkillMap = {
  // Database & Storage
  'sql': ['postgresql', 'mysql', 'sqlite', 'mariadb', 'oracle', 'sql server', 'mssql', 'rds'],
  'nosql': ['mongodb', 'redis', 'dynamodb', 'cassandra', 'couchdb', 'firebase', 'firestore', 'supabase', 'data persistence', 'storage layer'],
  'postgresql': ['postgres', 'pg'],
  'mongodb': ['mongo', 'document database', 'data persistence', 'storage layer', 'database design', 'nosql'],
  'redis': ['in-memory cache', 'caching store'],
  'database': ['sql', 'nosql', 'postgresql', 'mongodb', 'mysql', 'sqlite', 'redis', 'prisma', 'hibernate', 'schema', 'query', 'queries', 'indexing', 'index', 'vector db', 'vector database', 'migrations', 'database design', 'data persistence', 'storage layer'],
  'database design': ['sql', 'nosql', 'postgresql', 'mongodb', 'mysql', 'sqlite', 'redis', 'schema', 'indexing', 'migrations', 'data persistence', 'storage layer'],
  'data persistence': ['database', 'sql', 'nosql', 'postgresql', 'mongodb', 'mysql', 'redis', 'storage layer'],
  'storage layer': ['database', 'sql', 'nosql', 'postgresql', 'mongodb', 'mysql', 'redis', 'data persistence'],
  
  // APIs & Integration
  'rest api': ['restful', 'apis', 'endpoints', 'graphql', 'grpc', 'soap', 'fastapi', 'express', 'node.js', 'spring', 'express.js', 'server-side development', 'backend development'],
  'apis': ['rest api', 'restful', 'graphql', 'grpc', 'endpoints', 'endpoint'],
  'graphql': ['apollo', 'graphql api', 'graphql server'],

  // Backend & Ecosystems
  'backend': ['node.js', 'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'apis', 'rest api', 'sql', 'nosql', 'database', 'microservices', 'server-side development', 'node.js ecosystem'],
  'backend development': ['node.js', 'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'apis', 'rest api', 'sql', 'nosql', 'database', 'microservices', 'server-side development', 'node.js ecosystem'],
  'server-side development': ['node.js', 'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'apis', 'rest api', 'node.js ecosystem'],
  'node.js ecosystem': ['node.js', 'express', 'express.js', 'nodejs', 'nestjs', 'npm', 'yarn'],
  'node.js': ['nodejs', 'express', 'express.js', 'nestjs', 'javascript', 'typescript', 'npm', 'yarn'],
  'express': ['expressjs', 'express.js', 'node.js', 'javascript', 'typescript', 'server-side development', 'backend development', 'node.js ecosystem'],
  'python': ['django', 'flask', 'fastapi', 'numpy', 'pandas', 'scikit-learn', 'pytorch', 'tensorflow'],
  'java': ['spring', 'springboot', 'jee', 'hibernate', 'maven', 'gradle'],
  'spring': ['springboot', 'spring boot', 'java'],
  'c++': ['cpp', 'c/c++'],
  'c#': ['dotnet', '.net', 'asp.net'],
  'git': ['github', 'gitlab', 'bitbucket', 'version control', 'commits', 'pr'],
  'docker': ['docker-compose', 'containers', 'containerization'],
  'ci/cd': ['github actions', 'jenkins', 'circleci', 'travis', 'argocd', 'pipelines'],

  // Frontend & Design
  'react': ['reactjs', 'redux', 'next.js', 'gatsby', 'context api'],
  'typescript': ['ts', 'angular', 'nestjs', 'next.js'],
  'javascript': ['js', 'es6', 'jquery', 'ajax'],
  'html': ['html5', 'xhtml', 'markup'],
  'css': ['css3', 'sass', 'scss', 'less', 'tailwind', 'bootstrap'],
  'tailwind': ['tailwind css', 'tailwindcss'],
  'responsive design': ['media queries', 'mobile-first', 'bootstrap', 'flexbox', 'grid'],
  'figma': ['sketch', 'adobe xd', 'wireframes', 'prototyping'],

  // AI & ML
  'machine learning': ['ml', 'deep learning', 'pytorch', 'tensorflow', 'scikit-learn', 'neural networks', 'llm', 'nlp', 'computer vision'],
  'deep learning': ['dl', 'pytorch', 'tensorflow', 'keras', 'neural networks', 'llm', 'transformers'],
  'pytorch': ['py-torch', 'torch'],
  'tensorflow': ['tensor-flow', 'keras'],
  'langchain': ['llm', 'agents', 'rag'],

  // Cloud & DevOps
  'aws': ['amazon web services', 's3', 'ec2', 'lambda', 'rds', 'dynamodb', 'cloudformation'],
  'gcp': ['google cloud', 'google cloud platform', 'gke', 'bigquery', 'app engine'],
  'azure': ['microsoft azure', 'azure DevOps', 'aks'],
  'kubernetes': ['k8s', 'helm', 'kubectl'],
  'microservices': ['microservice', 'distributed systems', 'service mesh', 'gRPC', 'load balancing'],
  
  // Agile & Management
  'agile': ['scrum', 'kanban', 'jira', 'confluence', 'daily standup'],
  'scrum': ['agile', 'sprint', 'scrum master'],
  'testing': ['unit testing', 'integration testing', 'jest', 'mocha', 'chai', 'cypress', 'selenium', 'playwright', 'pytest'],
  'unit testing': ['testing', 'jest', 'mocha', 'junit', 'pytest', 'unit tests'],
  'security': ['cryptography', 'aes', 'https', 'ssl', 'encryption', 'hashing', 'cors', 'owasp', 'jwt', 'auth']
};

/**
 * Checks for direct or semantic match for a skill.
 * @param {string} skill
 * @param {string} text
 * @returns {boolean}
 */
const hasSemanticSkillMatch = (skill, text) => {
  const directRegex = getKeywordRegex(skill);
  if (directRegex.test(text)) {
    return true;
  }

  const normalizedSkill = skill.toLowerCase().trim();
  const synonyms = semanticSkillMap[normalizedSkill];
  if (synonyms && synonyms.length > 0) {
    for (const syn of synonyms) {
      const synRegex = getKeywordRegex(syn);
      if (synRegex.test(text)) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Evaluates architectural complexity for a given missing skill.
 * If candidate demonstrates high complexity in project descriptions, partial competence is granted.
 * @param {string} skill
 * @param {string} text
 * @returns {boolean}
 */
const checkArchitecturalComplexity = (skill, text) => {
  if (!skill || !text) return false;
  const s = skill.toLowerCase().trim();
  
  // DevOps / Deployment family complexity
  if (['docker', 'kubernetes', 'ci/cd', 'terraform', 'ansible', 'argocd', 'jenkins'].some(x => s.includes(x))) {
    const devOpsRegex = /\b(?:docker-compose|k8s|kubernetes|helm|ci\/cd|pipeline|pipelines|github\s*actions|jenkins|terraform|infrastructure\s*as\s*code|iac|orchestrat|multi-container|cluster)\b/i;
    return devOpsRegex.test(text);
  }
  
  // Database / Storage family complexity
  if (['sql', 'nosql', 'postgresql', 'mongodb', 'redis', 'database', 'mariadb', 'mysql', 'sqlite', 'dynamodb'].some(x => s.includes(x))) {
    const dbRegex = /\b(?:3-layer|sharding|replication|partitioning|redundant\s*storage|ipfs|s3|indexing|query\s*optimization|cache|caching|nosql|postgresql|mongodb|schema|transactions?|migration)\b/i;
    return dbRegex.test(text);
  }
  
  // Cloud family complexity
  if (['aws', 'gcp', 'azure', 'cloud'].some(x => s.includes(x))) {
    const cloudRegex = /\b(?:s3|ec2|lambda|cloud\s*provider|multi-cloud|vpc|autoscaling|load\s*balancer|serverless|iam|route53|rds|dynamodb|gke|cloudrun)\b/i;
    return cloudRegex.test(text);
  }
  
  // Security family complexity
  if (['security', 'cryptography', 'aes', 'encryption', 'jwt', 'oauth', 'auth'].some(x => s.includes(x))) {
    const secRegex = /\b(?:aes-256|aes|encryption|vaults?|hashing|bcrypt|ssl|https|cors|owasp|token-based|rbac|auth|jwt)\b/i;
    return secRegex.test(text);
  }
  
  // Backend API family complexity
  if (['node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'rest api', 'graphql', 'apis', 'backend'].some(x => s.includes(x))) {
    const apiRegex = /\b(?:restful|endpoints?|middleware|graphql|grpc|asynchronous|concurrency|mvc|orm|microservices?)\b/i;
    return apiRegex.test(text);
  }

  // Frontend family complexity
  if (['react', 'next.js', 'angular', 'vue', 'tailwind', 'sass', 'responsive design', 'frontend'].some(x => s.includes(x))) {
    const frontRegex = /\b(?:spa|state\s*management|redux|context\s*api|server-side\s*rendering|ssr|responsive|mobile-first|flexbox|grid|typography|accessibility)\b/i;
    return frontRegex.test(text);
  }
  
  return false;
};

/**
 * Computes dynamic weighting mapping based on resolved job role.
 * Ensures the weights sum to exactly 100 points.
 * @param {string} roleName
 * @returns {object}
 */
const getDynamicWeights = (roleName) => {
  // Enforce a strict, context-aware, role-dependent scoring weight system
  // where "Skills & Match Quality" acts as the true gatekeeper (40% weight).
  // "Experience & Impact Metrics" are reduced to 10%, and "Projects & Core Stack" is 15%.
  return {
    contact: 5,
    formatting: 5,
    skills: 40,
    projects: 15,
    experience: 10,
    education: 10,
    keywords: 10,
    achievements: 5
  };
};

/**
 * Helper to identify individual project entries in section text
 */
const parseProjectEntries = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const entries = [];
  let currentEntry = null;

  for (const line of lines) {
    const isBullet = /^[-•*+]\s+/.test(line);
    if (!isBullet && line.length < 80) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      currentEntry = {
        title: line,
        details: []
      };
    } else if (currentEntry) {
      currentEntry.details.push(line);
    }
  }
  if (currentEntry) {
    entries.push(currentEntry);
  }
  return entries;
};

/**
 * Helper to identify individual experience entries in section text
 */
const parseExperienceEntries = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const entries = [];
  let currentEntry = null;

  for (const line of lines) {
    const isBullet = /^[-•*+]\s+/.test(line);
    if (!isBullet && line.length < 100) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      currentEntry = {
        title: line,
        details: []
      };
    } else if (currentEntry) {
      currentEntry.details.push(line);
    }
  }
  if (currentEntry) {
    entries.push(currentEntry);
  }
  return entries;
};

/**
 * Resolves Core Anchor Keywords required for the selected targetRole.
 * If a resume matches ZERO core anchor keywords, it triggers a mismatched role penalty.
 * @param {string} resolvedRole
 * @returns {string[]}
 */
const getCoreAnchors = (resolvedRole) => {
  const anchors = {
    'Mobile Developer': ['react native', 'flutter', 'swift', 'kotlin', 'android sdk', 'ios sdk', 'objective-c', 'mobile app', 'xcode', 'android studio'],
    'Backend Developer': ['node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'nestjs', 'postgresql', 'mongodb', 'redis', 'apis', 'rest api', 'graphql'],
    'Frontend Developer': ['react', 'angular', 'vue', 'svelte', 'typescript', 'javascript', 'html', 'css', 'tailwind', 'next.js'],
    'Full Stack Developer': ['react', 'vue', 'angular', 'node.js', 'django', 'flask', 'express', 'sql', 'postgresql', 'mongodb', 'typescript', 'javascript'],
    'AI/ML Engineer': ['python', 'pytorch', 'tensorflow', 'scikit-learn', 'machine learning', 'deep learning', 'llm', 'nlp', 'computer vision', 'neural networks'],
    'Data Scientist': ['python', 'r', 'pandas', 'numpy', 'sql', 'machine learning', 'statistics', 'data science'],
    'Data Analyst': ['sql', 'excel', 'tableau', 'power bi', 'python', 'pandas', 'data visualization', 'analytics'],
    'DevOps Engineer': ['docker', 'kubernetes', 'ci/cd', 'terraform', 'ansible', 'jenkins', 'linux', 'aws', 'gcp', 'infrastructure'],
    'Cloud Engineer': ['aws', 'azure', 'gcp', 'terraform', 'cloud infrastructure', 'serverless', 'iam', 's3', 'ec2'],
    'Cybersecurity Analyst': ['security', 'cryptography', 'siem', 'firewalls', 'vulnerability', 'owasp', 'penetration testing', 'cybersecurity'],
    'QA Engineer': ['selenium', 'cypress', 'playwright', 'jest', 'pytest', 'junit', 'testing', 'qa', 'automation testing'],
    'Product Manager': ['product strategy', 'roadmap', 'user research', 'agile', 'scrum', 'product lifecycle', 'prd', 'product management'],
    'UI/UX Designer': ['figma', 'wireframing', 'prototyping', 'user research', 'ui design', 'ux design', 'design systems', 'sketch', 'adobe xd']
  };
  const list = anchors[resolvedRole];
  if (list) return list;
  
  // Dynamic fallback using the role config essential list
  const role = rolesConfig[resolvedRole] || rolesConfig['Other'];
  const essential = role.essential || [];
  return essential.slice(0, 5).map(s => typeof s === 'string' ? s.toLowerCase() : (s && s.name ? s.name.toLowerCase() : ''));
};

/**
 * Scores a resume based on realistic ATS evaluation criteria with 8 required categories.
 * @param {string} text - Raw resume text content.
 * @param {string} targetRole - Target role.
 * @returns {object} - Scored results, including breakdown, strengths, weaknesses, recommendations, and missingSections.
 */
const scoreResume = (text, targetRole = 'Software Engineer') => {
  const normalizedText = text || '';

  // Resolve Target Role Configuration
  let resolvedRole = 'Other';
  const searchRole = targetRole.toLowerCase();
  if (searchRole.includes('backend')) resolvedRole = 'Backend Developer';
  else if (searchRole.includes('frontend')) resolvedRole = 'Frontend Developer';
  else if (searchRole.includes('full stack') || searchRole.includes('fullstack')) resolvedRole = 'Full Stack Developer';
  else if (searchRole.includes('ai') || searchRole.includes('machine learning') || searchRole.includes('ml')) resolvedRole = 'AI/ML Engineer';
  else if (searchRole.includes('data scientist')) resolvedRole = 'Data Scientist';
  else if (searchRole.includes('data analyst')) resolvedRole = 'Data Analyst';
  else if (searchRole.includes('devops')) resolvedRole = 'DevOps Engineer';
  else if (searchRole.includes('cloud')) resolvedRole = 'Cloud Engineer';
  else if (searchRole.includes('mobile') || searchRole.includes('ios') || searchRole.includes('android')) resolvedRole = 'Mobile Developer';
  else if (searchRole.includes('cyber') || searchRole.includes('security')) resolvedRole = 'Cybersecurity Analyst';
  else if (searchRole.includes('qa') || searchRole.includes('testing')) resolvedRole = 'QA Engineer';
  else if (searchRole.includes('product manager') || searchRole.includes('pm')) resolvedRole = 'Product Manager';
  else if (searchRole.includes('designer') || searchRole.includes('ui/ux') || searchRole.includes('graphic')) resolvedRole = 'UI/UX Designer';
  else if (rolesConfig[targetRole]) resolvedRole = targetRole;

  const role = rolesConfig[resolvedRole] || rolesConfig['Other'];
  const essentialSkills = role.essential || [];
  const recommendedSkills = role.recommended || [];
  const essentialSkillsStrings = essentialSkills.map(s => typeof s === 'string' ? s : (s && s.name) || '');
  const recommendedSkillsStrings = recommendedSkills.map(s => typeof s === 'string' ? s : (s && s.name) || '');
  const roleSkillsStrings = [...essentialSkillsStrings, ...recommendedSkillsStrings];
  const anchors = getCoreAnchors(resolvedRole);

  // Dynamic role-agnostic property fallbacks
  const experienceTitles = role.experienceTitles || [
    'engineer', 'developer', 'analyst', 'programmer', 'architect', 'consultant',
    'specialist', 'lead', 'manager', 'designer', 'intern', 'co-op', 'apprentice', 'trainee'
  ];

  const industryKeywords = role.industryKeywords || [
    'optimization', 'scalability', 'architecture', 'infrastructure', 'deployment',
    'integration', 'security', 'collaboration', 'performance', 'monitoring',
    'testing', 'maintenance', 'development'
  ];

  const projectConcepts = role.projectConcepts || [
    { name: 'Systems Architecture', regex: /\b(?:architecture|design\s*patterns?|mvc|system\s*design|microservices?|serverless|single\s*page\s*app|spa|redux|context\s*api|state\s*management|oop|async|concurrency|multithreading|algorithms?|structures?|next\.js|nextjs|react|vue|angular|swiftui|kotlin|flutter|responsive)\b/i },
    { name: 'Authentication (JWT/OAuth)', regex: /\b(?:auth|authentication|authorization|jwt|oauth|oauth2|passport|session|sessions|cookies|token|login|signup|signin|signout|role-based|rbac)\b/i },
    { name: 'Database Design (PostgreSQL/MongoDB/Redis)', regex: /\b(?:database|postgres|postgresql|mongodb|mysql|sqlite|redis|prisma|hibernate|sql|nosql|schema|query|queries|indexing|index|vector\s*db|vector\s*database|migrations?|localstorage|sessionstorage|state|props)\b/i },
    { name: 'Security (HTTPS/CORS/Rate Limiting)', regex: /\b(?:cors|https|ssl|encryption|hashing|security|bcrypt|rate\s*limiting|sql\s*injection|xss|csrf|sanitiz|oauth|jwt)\b/i },
    { name: 'Scalability (Caching/Load Balancers/Queues)', regex: /\b(?:caching|cdn|redis|load\s*balanc|scaling|optimize|optimization|performance|lazy\s*load|code\s*split|compression|throughput|latency|uptime|cluster|kafka|rabbitmq|message\s*queue|lighthouse|page\s*speed|responsive|mobile-first)\b/i },
    { name: 'Cloud Infrastructure (AWS/GCP/Azure/Firebase)', regex: /\b(?:aws|gcp|azure|google\s*cloud|amazon\s*web|cloud\s*provider|firebase|supabase|amplify|s3|ec2|lambda|cloudflare|route53|rds|dynamodb|vercel|netlify|heroku|render)\b/i },
    { name: 'DevOps & Deployment (Docker/CI-CD/Vercel)', regex: /\b(?:docker|kubernetes|ci\/cd|github\s*actions|jenkins|vercel|netlify|heroku|render|nginx|docker-compose|k8s|argocd|ansible|terraform)\b/i },
    { name: 'Engineering Practices (Testing/Git)', regex: /\b(?:testing|unit\s*test|jest|cypress|mocha|git|github|version\s*control|agile|scrum|jira|confluence|documentation|readme|unit\s*tests?|integration\s*tests?|playwright|selenium)\b/i }
  ];

  const concepts = role.concepts || [
    { name: 'Microservices', regex: /\b(?:microservices?|distributed\s*systems?|load\s*balancing|high\s*availability|service\s*mesh|kubernetes|k8s)\b/i },
    { name: 'Message Queues', regex: /\b(?:kafka|rabbitmq|message\s*queues?|pub\s*sub|event\s*driven|sqs)\b/i },
    { name: 'AES Encryption', regex: /\b(?:aes|encryption|hashing|bcrypt|cryptography|aes\s*encryption)\b/i },
    { name: 'Redis', regex: /\b(?:redis|memcached|caching|cache)\b/i },
    { name: 'Docker', regex: /\b(?:docker|docker-compose|containers?)\b/i },
    { name: 'CI/CD', regex: /\b(?:ci\/cd|jenkins|github\s*actions|argocd|pipelines?|vercel|netlify)\b/i },
    { name: 'JWT & OAuth', regex: /\b(?:jwt|oauth|oauth2|token-based|passport)\b/i },
    { name: 'AWS & Cloud', regex: /\b(?:aws|azure|gcp|terraform|cloudformation|serverless|lambda|s3|ec2|vercel|netlify|heroku|render)\b/i },
    { name: 'Background Jobs', regex: /\b(?:background\s*(?:jobs?|processing)|concurrency|multithreading|async|worker\s*threads?|celery|bullmq)\b/i },
    { name: 'Blockchain & IPFS', regex: /\b(?:blockchain|ethereum|solidity|smart\s*contracts?|web3|ipfs|crypto)\b/i }
  ];

  const experienceCriteria = role.experienceCriteria || [
    {
      name: 'REST/GraphQL APIs & Production Systems',
      maxPoints: 4,
      evaluate: (text) => {
        let devScore = 0;
        const backendRegex = /\b(?:api|apis|rest|graphql|grpc|endpoint|endpoints|backend|server|servers|database|databases|sql|nosql|query|queries|schema|route|routes)\b/i;
        const deploymentRegex = /\b(?:automation|automated|automate|deploy|deployed|deployment|live|production|pipeline|pipelines|ci\/cd|docker|kubernetes|aws|gcp|azure|terraform)\b/i;
        if (backendRegex.test(text)) devScore += 2;
        if (deploymentRegex.test(text)) devScore += 2;
        return devScore;
      }
    },
    {
      name: 'Backend Performance Optimization & Scaling',
      maxPoints: 4,
      evaluate: (text) => {
        let optScore = 0;
        const perfRegex = /\b(?:optimize|optimized|optimizing|optimization|performance|scale|scaled|scaling|scalability|caching|redis|latency|throughput|response\s*time|refactor|refactored|refactoring)\b/i;
        const dbOptRegex = /\b(?:query\s*optimization|database\s*indexing|index|indexes|indexing|query\s*time|database\s*lock|sharding|replication|partition|pruning)\b/i;
        if (perfRegex.test(text)) optScore += 2;
        if (dbOptRegex.test(text)) optScore += 2;
        return optScore;
      }
    }
  ];
  
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];

  // Date and chronological indicators
  const dateRangeRegex = /\b(?:19|20)\d{2}\b[^\n]*\b(?:(?:19|20)\d{2}|present|current|now)\b/i;
  const singleDateRegex = /\b(?:19|20)\d{2}\b/i;

  // ----------------------------------------------------
  // FIX 1: Robust line-by-line Section Boundary Detection
  // ----------------------------------------------------
  const lines = normalizedText.split(/\r?\n/);
  
  const sectionMapping = {
    summary: ['summary', 'objective', 'profile', 'about me', 'professional summary', 'career objective'],
    experience: ['experience', 'work experience', 'employment', 'professional experience', 'work history', 'employment history', 'professional background'],
    projects: ['projects', 'personal projects', 'academic projects', 'portfolio', 'selected projects', 'technical projects'],
    skills: ['skills', 'technical skills', 'technologies', 'core competencies', 'skills & technologies', 'professional skills', 'skills & tools', 'tools'],
    education: ['education', 'academic background', 'academic history', 'educational background', 'education history'],
    achievements: [
      'achievements', 'awards', 'accomplishments', 'certifications', 'honors', 'leadership',
      'licenses', 'credentials', 'key achievements', 'leadership history',
      'certifications & licenses', 'certifications and licenses', 'awards & achievements',
      'awards and achievements', 'achievements & certifications', 'achievements and certifications',
      'achievements & awards', 'achievements and awards', 'leadership & activities',
      'leadership and activities', 'leadership credentials', 'honors & awards', 'honors and awards'
    ]
  };

  const sections = {
    header: [],
    summary: [],
    experience: [],
    projects: [],
    skills: [],
    education: [],
    achievements: []
  };

  let currentSection = 'header';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sections[currentSection].push(line);
      continue;
    }

    let foundHeader = false;
    for (const [key, synonyms] of Object.entries(sectionMapping)) {
      // General regex fallback for achievements/credentials and key achievements
      const isAchievementsMatch = key === 'achievements' && 
        /^\s*(?:[^a-zA-Z0-9]*\s*)?(?:key\s+)?(?:achievements?|awards?|accomplishments?|certifications?|licenses?|credentials?|honors?|leadership(?:\s+history)?|activities)(?:\s*(?:&|and|or|,)\s*(?:achievements?|awards?|accomplishments?|certifications?|licenses?|credentials?|honors?|leadership|activities))*\s*[^a-zA-Z0-9]*$/i.test(trimmed);

      if (isAchievementsMatch || synonyms.some(syn => {
        const escaped = syn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`^\\s*(?:[^a-zA-Z0-9]*\\s*)?${escaped}(?:\\s*[^a-zA-Z0-9]*)?\\s*$`, 'i');
        return regex.test(trimmed);
      })) {
        currentSection = key;
        foundHeader = true;
        break;
      }
    }

    if (!foundHeader) {
      sections[currentSection].push(line);
    }
  }

  // Join the sections back into text blocks
  const summaryText = sections.summary.join('\n');
  const experienceText = sections.experience.join('\n');
  const projectsText = sections.projects.join('\n');
  const skillsText = sections.skills.join('\n');
  const educationText = sections.education.join('\n');
  const achievementsText = sections.achievements.join('\n');

  // Log the character count of each extracted section so failures are immediately visible
  logger.info('ATSScorer', `Extracted Sections - Summary: ${summaryText.length} chars, Experience: ${experienceText.length} chars, Projects: ${projectsText.length} chars, Skills: ${skillsText.length} chars, Education: ${educationText.length} chars, Achievements: ${achievementsText.length} chars.`);

  const hasExperienceHeader = experienceText.trim().length > 0;
  const hasProjectsHeader = projectsText.trim().length > 0;
  const hasSkillsHeader = skillsText.trim().length > 0;
  const hasEducationHeader = educationText.trim().length > 0;
  const hasSummaryHeader = summaryText.trim().length > 0;

  // Dynamic career stage detection (Timeline longevity check)
  const years = (normalizedText.match(/\b(20\d{2})\b/g) || []).map(Number);
  const maxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
  const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear();
  const timelineSpan = maxYear - minYear;

  const hasFresherKeywords = /\b(?:student|intern|internship|undergrad|undergraduate|freshman|sophomore|co-op|fresher|graduate|academic\s*project|hackathon|gpa|cgpa|expected\s*graduation)\b/i.test(normalizedText);
  const hasSeniorKeywords = /\b(?:senior|lead|principal|architect|manager|director|head|vp)\b/i.test(normalizedText);
  const isFresher = (timelineSpan <= 4 || hasFresherKeywords) && !hasSeniorKeywords;

  // ----------------------------------------------------
  // 1. Contact Information & Profile Details (Raw Max 10)
  // ----------------------------------------------------
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(normalizedText);
  const hasPhone = /(?:\+?[0-9]{1,4}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/.test(normalizedText);
  const hasLocation = /\b(?:location|address|zip|city|state|remote|india|usa|uk|canada|germany|singapore|australia)\b|([A-Z][a-zA-Z\s]+,\s*[A-Z]{2,})/i.test(normalizedText);
  const hasLink = /linkedin\.com|github\.com|portfolio|bitbucket|gitlab|leetcode|behance|dribbble/i.test(normalizedText);

  let contactScore = 0;
  const contactDeductions = [];
  if (hasEmail) contactScore += 2.5; else contactDeductions.push('Email address');
  if (hasPhone) contactScore += 2.5; else contactDeductions.push('Phone number');
  if (hasLocation) contactScore += 2.5; else contactDeductions.push('Location details');
  if (hasLink) contactScore += 2.5; else contactDeductions.push('LinkedIn, GitHub, or Portfolio profile link');

  const rawContactScore = clamp(Math.round(contactScore * 2) / 2, 0, 10);

  if (rawContactScore === 10) {
    strengths.push('Complete contact info and professional links (Email, Phone, Location, and Profile/Portfolio links) are present.');
  } else if (contactDeductions.length > 0) {
    weaknesses.push(`Missing profile contact details: ${contactDeductions.join(', ')}.`);
    recommendations.push(`Add the missing contact or professional profile details: ${contactDeductions.join(', ')}.`);
  }

  // ----------------------------------------------------
  // 2. Formatting & Structural Design (Raw Max 10)
  // ----------------------------------------------------
  let formattingScore = 0;
  if (hasExperienceHeader) formattingScore += 2; else weaknesses.push('Missing a standard Work Experience section.');
  if (hasSkillsHeader) formattingScore += 2; else weaknesses.push('Missing a dedicated Technical Skills section.');
  if (hasEducationHeader) formattingScore += 2; else weaknesses.push('Missing a standard Education section.');

  if (hasSummaryHeader) formattingScore += 2; else recommendations.push('Add a Professional Summary or Profile Objective at the top of your resume.');

  const hasBullets = /\n\s*[-•*+]\s+/.test(normalizedText);
  const hasDates = dateRangeRegex.test(normalizedText);
  if (hasBullets) formattingScore += 1;
  if (hasDates) formattingScore += 1;

  const rawFormattingScore = clamp(formattingScore, 0, 10);

  if (rawFormattingScore === 10) {
    strengths.push('Excellent resume layout with a summary, standard headings, clear timeline ranges, and bulleted layout.');
  }

  // ----------------------------------------------------
  // 3. Skills & Match Quality (Raw Max 20)
  // ----------------------------------------------------
  let essentialMatchedCount = 0;
  let recommendedMatchedCount = 0;
  const matchedSkillsList = [];
  const missingSkillsFromEssential = [];

  let totalEssentialWeight = 0;
  let matchedEssentialWeight = 0;

  essentialSkills.forEach(rawSkill => {
    const skillObj = normalizeSkill(rawSkill);
    if (!skillObj) return;
    const skillName = skillObj.name;
    const skillWeight = skillObj.weight;

    totalEssentialWeight += skillWeight;

    if (hasSemanticSkillMatch(skillName, normalizedText)) {
      essentialMatchedCount++;
      matchedEssentialWeight += skillWeight;
      matchedSkillsList.push(skillName);
    } else if (checkArchitecturalComplexity(skillName, normalizedText)) {
      essentialMatchedCount += 0.85; // Semantic Complexity Credit
      matchedEssentialWeight += skillWeight * 0.85;
      matchedSkillsList.push(skillName + " (Evidence-based Match)");
    } else {
      missingSkillsFromEssential.push(skillName);
    }
  });

  let totalRecommendedWeight = 0;
  let matchedRecommendedWeight = 0;

  recommendedSkills.forEach(rawSkill => {
    const skillObj = normalizeSkill(rawSkill);
    if (!skillObj) return;
    const skillName = skillObj.name;
    const skillWeight = skillObj.weight;

    totalRecommendedWeight += skillWeight;

    if (hasSemanticSkillMatch(skillName, normalizedText)) {
      recommendedMatchedCount++;
      matchedRecommendedWeight += skillWeight;
      matchedSkillsList.push(skillName);
    } else if (checkArchitecturalComplexity(skillName, normalizedText)) {
      recommendedMatchedCount += 0.85; // Semantic Complexity Credit
      matchedRecommendedWeight += skillWeight * 0.85;
      matchedSkillsList.push(skillName + " (Evidence-based Match)");
    }
  });

  // Progressive Partial Scoring (eliminates all-or-nothing threshold gating)
  const skillsScoreEssential = totalEssentialWeight > 0 
    ? (matchedEssentialWeight / totalEssentialWeight) * 12 
    : 0;

  const skillsScoreRecommended = totalRecommendedWeight > 0 
    ? (matchedRecommendedWeight / totalRecommendedWeight) * 5 
    : 0;

  let skillsOrganizationScore = 0;
  const targetText = skillsText || normalizedText;
  const hasCategories = /languages|frameworks|libraries|databases|tools|platforms|technologies|developer tools|operating systems/i.test(targetText);
  if (hasCategories) {
    skillsOrganizationScore = 3;
  } else if (hasSkillsHeader) {
    skillsOrganizationScore = 1.5;
  }

  // Apply progressive deductions/penalties for missing essential skills without bottoming out to 0
  const baseSkillsTotal = skillsScoreEssential + skillsScoreRecommended + skillsOrganizationScore;
  const skillsPenalty = Math.min(baseSkillsTotal * 0.4, missingSkillsFromEssential.length * 0.75);
  const rawSkillsScore = clamp(baseSkillsTotal - skillsPenalty, 0, 20);

  if (rawSkillsScore >= 16) {
    strengths.push(`Strong alignment of core and secondary technical skills matching the ${targetRole} target profile.`);
  } else if (missingSkillsFromEssential.length > 0) {
    recommendations.push(`Integrate key technical skills for the ${targetRole} role, such as: ${missingSkillsFromEssential.slice(0, 3).join(', ')}.`);
  }

  // ----------------------------------------------------
  // FIX 2: Projects & Core Stack Presence (Raw Max 15)
  // ----------------------------------------------------
  let rawProjectsScore = 0;
  const projTargetText = projectsText || normalizedText;

  if (projTargetText.trim().length > 0) {
    const projectEntries = parseProjectEntries(projTargetText);
    let qualifyingCount = 0;

    projectEntries.forEach(entry => {
      if (!entry.title) return;

      // Merge role essential and recommended skills with the generic techKeywords for project tech matching
      const combinedTechKeywords = [...new Set([...techKeywords, ...roleSkillsStrings.map(s => s.toLowerCase())])];

      // Tech stack count (at least 2 keywords, matched semantically to support synonyms)
      const matchedTech = combinedTechKeywords.filter(kw => {
        return hasSemanticSkillMatch(kw, entry.title) || entry.details.some(d => hasSemanticSkillMatch(kw, d));
      });

      const detailsText = entry.details.join(' ');
      const hasLink = /github\.com|gitlab|bitbucket|vercel|netlify|heroku|app\s*store|live|\bhttp|https\b/i.test(detailsText) || /github\.com|vercel|netlify/i.test(entry.title);
      const hasMetric = /\b(?:\d+%\s*|\$\d+|\d+\s*x\s*|latency|throughput|saved \d+ hours)\b|\b\d+(?:\s*[kKmM]\+?)?\s*(?:active\s*)?(?:users|downloads|requests|queries|records|percent|%)\b/i.test(detailsText);
      const hasFeature = detailsText.length >= 20;

      // Project description must contain keywords matching the target domain (anchors or essential skills)
      const domainSearchList = anchors.length > 0 ? anchors : essentialSkillsStrings.map(s => s.toLowerCase());
      const hasDomainKeywords = domainSearchList.some(anchor => {
        return hasSemanticSkillMatch(anchor, entry.title) || entry.details.some(d => hasSemanticSkillMatch(anchor, d));
      });

      if (matchedTech.length >= 2 && (hasLink || hasMetric || hasFeature) && hasDomainKeywords) {
        qualifyingCount++;
      }
    });

    // Score: 1 project = 4.0 pts, 2 = 8.0 pts, 3 = 11.5 pts, 4+ = 13.0 pts
    let entryPoints = 0;
    if (qualifyingCount === 1) entryPoints = 4.0;
    else if (qualifyingCount === 2) entryPoints = 8.0;
    else if (qualifyingCount === 3) entryPoints = 11.5;
    else if (qualifyingCount >= 4) entryPoints = 13.0;

    // Advanced concepts: up to 2 points
    let advancedScore = 0;
    concepts.forEach(c => {
      if (c.regex.test(projTargetText)) {
        advancedScore += 0.5;
      }
    });
    advancedScore = Math.min(2.0, advancedScore);

    rawProjectsScore = clamp(entryPoints + advancedScore, 0, 15);
    rawProjectsScore = Math.round(rawProjectsScore * 2) / 2;
  }

  if (rawProjectsScore >= 12) {
    strengths.push('Technical projects demonstrate good architectural complexity, database usage, deployment, and security considerations.');
  }

  // ----------------------------------------------------
  // FIX 3: Experience & Impact Metrics (Raw Max 20)
  // ----------------------------------------------------
  let experienceScore = 0;
  const expTargetText = experienceText || normalizedText;

  if (expTargetText.trim().length > 0) {
    const expEntries = parseExperienceEntries(expTargetText);
    let baseScore = 0;

    expEntries.forEach(entry => {
      if (!entry.title) return;

      const isIntern = /\b(?:intern|internship|co-op|apprentice|trainee|placement)\b/i.test(entry.title);
      const isExtraOrLead = /\b(?:lead|leader|president|vice|officer|secretary|organizer|treasurer|chair|founder|mentor|coordinator|captain|representative|committee|chapter|club|society|ieee|acm|gdsc|team)\b/i.test(entry.title);
      const isJob = experienceTitles.some(t => new RegExp(`\\b${t}\\b`, 'i').test(entry.title)) || /\b(?:developer|engineer|analyst|specialist|programmer|architect)\b/i.test(entry.title);

      const detailsText = entry.details.join(' ');
      const metricRegex = /\b(?:\d+%\s*|\$\d+|\d+\s*x\s*|latency|throughput|uptime|test coverage)\b|\b\d+(?:\s*[kKmM]\+?)?\s*(?:active\s*)?(?:users|requests|queries|records|endpoints|tasks|jobs|servers|databases|gb|tb|mb|kb|percent|%)\b/i;
      const hasQuantified = metricRegex.test(detailsText);

      let rolePoints = 0;
      if (isJob) {
        rolePoints = 5;
      } else if (isIntern) {
        rolePoints = 4;
      } else if (isExtraOrLead) {
        rolePoints = 3;
      } else {
        rolePoints = 2;
      }

      if (hasQuantified) {
        rolePoints += 2;
      }

      baseScore += rolePoints;
    });

    baseScore = Math.min(16, baseScore);

    // Criteria alignment / context score (Up to 4 points)
    let criteriaScore = 0;
    experienceCriteria.forEach(crit => {
      criteriaScore += Math.min(crit.maxPoints / 2, crit.evaluate(expTargetText) / 2);
    });
    criteriaScore = Math.min(4.0, criteriaScore);

    experienceScore = baseScore + criteriaScore;

    // Apply Fresher Safeguard alternative calculations to prevent penalizing student timelines
    if (isFresher) {
      let academicScore = 0;
      const gpaRegex = /\b(?:gpa|cgpa)\b\s*(?:of\s*)?([3-4]\.\d+|[8-9]\.\d+|10(?:\.0)?)\b|\b(?:dean's\s*list|academic\s*excellence|first\s*class|distinction|graduated\s*with\s*honors)\b/i;
      if (gpaRegex.test(normalizedText)) {
        academicScore = 8;
      } else if (hasEducationHeader) {
        academicScore = 6;
      }

      let chapterScore = 0;
      const chapterRegex = /\b(?:hackathon|ieee|acm|gdsc|club|society|volunteer|organizer|chapter|contribution|open\s*source|github|pr|pull\s*request)\b/i;
      const chapterMatches = (normalizedText.match(chapterRegex) || []).length;
      if (chapterMatches >= 3) chapterScore = 6;
      else if (chapterMatches >= 1) chapterScore = 4;

      let projectComplexityScore = 0;
      if (rawProjectsScore >= 12) projectComplexityScore = 6;
      else if (rawProjectsScore >= 8) projectComplexityScore = 4;
      else projectComplexityScore = 2;

      const fresherScore = academicScore + chapterScore + projectComplexityScore;
      experienceScore = Math.max(experienceScore, fresherScore);
    }
  }

  let rawExperienceScore = Math.min(20, experienceScore);

  if (rawExperienceScore >= 15) {
    strengths.push('Professional history demonstrates strong role alignment, active contributions, and quantitative impact.');
  } else {
    recommendations.push('Add more metric-driven bullet points to your work history, highlighting achievements (e.g. latency, throughput, percentages).');
  }

  // ----------------------------------------------------
  // EVIDENCE-BASED METRIC MULTIPLIER (Up to 1.25x multiplier for quantified phrasing)
  // ----------------------------------------------------
  const latencyMetricRegexAll = /\b(?:reduced|decreased|cut|lower)\s+latency\b|latency\s+(?:reduced|decreased|improved|by\s+\d+)\b|\b(?:latency|response\s*time)\b[^\n]*\b(?:\d+%|\d+\s*ms)\b/gi;
  const perfMetricRegexAll = /\b(?:improved|increased|boosted|optimized)\s+performance\b|\b(?:scalable|scale)\s+systems?\b/gi;
  const apiMetricRegexAll = /\b(?:optimized|optimized\s*api|optimized\s*apis|reduced\s*query\s*time|query\s*time\s*reduced|query\s*latency)\b/gi;
  const genericMetricRegexAll = /\b(?:\d+%\s*|\$\d+|\d+\s*x\s*|uptime|test coverage)\b|\b\d+(?:\s*[kKmM]\+?)?\s*(?:active\s*)?(?:users|requests|queries|records|endpoints|tasks|jobs|servers|databases|gb|tb|mb|kb|percent|%)\b/gi;

  const latMatches = normalizedText.match(latencyMetricRegexAll) || [];
  const perfMatches = normalizedText.match(perfMetricRegexAll) || [];
  const apiMatches = normalizedText.match(apiMetricRegexAll) || [];
  const genMatches = normalizedText.match(genericMetricRegexAll) || [];

  const totalMetricsCount = latMatches.length + perfMatches.length + apiMatches.length + genMatches.length;
  const metricMultiplier = Math.min(1.25, 1.0 + (totalMetricsCount * 0.05));

  // Reward complexity & metric indicators
  rawExperienceScore = clamp(rawExperienceScore * metricMultiplier, 0, 20);
  rawProjectsScore = clamp(rawProjectsScore * metricMultiplier, 0, 15);

  // ----------------------------------------------------
  // 6. Education & Academic Alignment (Raw Max 10)
  // ----------------------------------------------------
  let educationScore = 0;
  const eduTargetText = educationText || normalizedText;

  const relevantDegreeRegex = /\b(?:computer science|software engineering|information technology|data science|math|mathematics|physics|electrical engineering|electronics engineering|cs|ce|se|it|ee|ece|b\.tech|m\.tech|btech|mtech|b\.e|m\.e|b\.s|m\.s|bsc|msc|bachelor|master|phd|doctorate)\b/i;
  const bootcampRegex = /\b(?:bootcamp|udemy|coursera|nanodegree|certification|certified|credential)\b/i;
  
  if (relevantDegreeRegex.test(eduTargetText)) {
    educationScore += 5;
  } else if (bootcampRegex.test(eduTargetText)) {
    educationScore += 3.5;
  } else if (hasEducationHeader) {
    educationScore += 2;
  }

  if (hasEducationHeader) educationScore += 2;
  const universityRegex = /\b(?:university|college|school|institute|academy|polytechnic)\b/i;
  if (universityRegex.test(eduTargetText)) educationScore += 1;

  const hasEduDate = dateRangeRegex.test(eduTargetText) || singleDateRegex.test(eduTargetText);
  if (hasEduDate) educationScore += 2;

  const rawEducationScore = clamp(educationScore, 0, 10);

  // ----------------------------------------------------
  // 7. Keywords Density & Gaps (Raw Max 10)
  // ----------------------------------------------------
  let keywordsScore = 0;

  const primaryCount = matchedSkillsList.filter(s => essentialSkillsStrings.map(x => x.toLowerCase()).includes(s.toLowerCase())).length;
  const primaryScore = Math.min(3, primaryCount * 0.5);
  keywordsScore += primaryScore;

  const secondaryCount = matchedSkillsList.filter(s => recommendedSkillsStrings.map(x => x.toLowerCase()).includes(s.toLowerCase())).length;
  const secondaryScore = Math.min(2, secondaryCount * 0.5);
  keywordsScore += secondaryScore;

  const domainPracticesRegex = /\b(?:optimization|scalability|architecture|infrastructure|deployment|integration|security|collaboration|performance|monitoring|testing|maintenance|development)\b/gi;
  const matchesDomain = new Set(normalizedText.toLowerCase().match(domainPracticesRegex) || []);
  let contextualScore = 0;
  if (matchesDomain.size >= 4) contextualScore = 2;
  else if (matchesDomain.size >= 2) contextualScore = 1;
  else if (matchesDomain.size === 1) contextualScore = 0.5;
  keywordsScore += contextualScore;

  const evidenceRegex = /\b(?:implemented|designed|built|integrated|optimized|automated|migrated|scaled|secured)\b[^\n.]{1,80}\b(?:jwt|oauth|oauth2|api|apis|docker|kubernetes|aws|redis|kafka|database|postgres|mongodb|ci\/cd|pipeline|microservice|microservices|caching|security|scale)\b/gi;
  const evidenceMatches = new Set(normalizedText.toLowerCase().match(evidenceRegex) || []);
  let evidenceScore = 0;
  if (evidenceMatches.size >= 3) evidenceScore = 3;
  else if (evidenceMatches.size === 2) evidenceScore = 2;
  else if (evidenceMatches.size === 1) evidenceScore = 1;
  keywordsScore += evidenceScore;

  let rawKeywordsScore = clamp(Math.round(keywordsScore * 2) / 2, 0, 10);

  const stuffedKeywordsRegex = /\b(?:jwt|oauth|docker|kubernetes|aws|redis|kafka|database|postgres|mongodb|ci\/cd|pipeline|microservices)\b/gi;
  const totalKeywordsFrequency = (normalizedText.toLowerCase().match(stuffedKeywordsRegex) || []).length;
  if (totalKeywordsFrequency > 25 && evidenceMatches.size <= 2) {
    rawKeywordsScore = clamp(rawKeywordsScore, 0, 4);
  }

  // ----------------------------------------------------
  // 8. Achievements & Leadership Credentials (Raw Max 5)
  // ----------------------------------------------------
  let achievementsScore = 0;
  const achTargetText = achievementsText || normalizedText;

  const metricCheck = /(?:\d+%\s*|\$\d+|\d+\s*x\s*|latency|throughput|saved \d+ hours)/i.test(achTargetText);
  if (metricCheck) achievementsScore += 2.5;

  const recognitionRegex = /\b(?:award|awards|scholarship|hackathon|winner|placed|publication|patent|certificate|certified|certification|certifications|license|licenses|credential|credentials|achievement|achievements|honors|dean's list|promotion|promoted|lead|spearheaded|leadership|activities)\b/i;
  if (recognitionRegex.test(achTargetText)) achievementsScore += 2.5;

  const rawAchievementsScore = clamp(Math.round(achievementsScore * 2) / 2, 0, 5);

  if (rawAchievementsScore === 5) {
    strengths.push('Highlights quantifiable achievements and professional leadership credentials/awards.');
  } else {
    weaknesses.push('Achievements section is weak or lacks clear leadership credentials and awards.');
  }

  // ----------------------------------------------------
  // DYNAMIC WEIGHTING & SCALING ENGINE
  // ----------------------------------------------------
  const rawMax = {
    contact: 10,
    formatting: 10,
    skills: 20,
    projects: 15,
    experience: 20,
    education: 10,
    keywords: 10,
    achievements: 5
  };

  const roleWeights = getDynamicWeights(resolvedRole);

  // Fresher safeguard weights re-allocation
  if (isFresher) {
    const expWeight = roleWeights.experience;
    if (expWeight > 10) {
      const shift = expWeight - 10;
      roleWeights.experience = 10;
      roleWeights.skills += Math.ceil(shift * 0.4);
      roleWeights.projects += Math.floor(shift * 0.3);
      roleWeights.education += Math.floor(shift * 0.3);
    }
  }

  const rawScores = {
    contact: rawContactScore,
    formatting: rawFormattingScore,
    skills: rawSkillsScore,
    experience: rawExperienceScore,
    projects: rawProjectsScore,
    education: rawEducationScore,
    keywords: rawKeywordsScore,
    achievements: rawAchievementsScore
  };

  const breakdown = {};
  Object.keys(rawScores).forEach(category => {
    const rawVal = clamp(rawScores[category], 0, rawMax[category]);
    const maxVal = rawMax[category];
    const weightVal = roleWeights[category];
    const calculatedVal = Math.round((rawVal / maxVal) * weightVal);
    breakdown[category] = clamp(calculatedVal, 0, weightVal);
  });

  // 1. Core Anchor Keyword check (Hard Role-Specific Skill Gate)
  let matchedAnchorsCount = 0;
  if (anchors.length > 0) {
    anchors.forEach(anchor => {
      if (hasSemanticSkillMatch(anchor, normalizedText)) {
        matchedAnchorsCount++;
      }
    });
  }

  // Compute overall score deterministically
  let overallScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  // If anchors defined and zero matched, apply hard penalty
  const hasZeroAnchors = anchors.length > 0 && matchedAnchorsCount === 0;
  if (hasZeroAnchors) {
    overallScore = Math.min(60, Math.round(overallScore * 0.5));
    // Also push a weakness and recommendation explaining the domain mismatch
    weaknesses.push(`Resume lacks essential core technologies required for the ${targetRole} target domain.`);
    recommendations.push(`Acquire and highlight foundation core technologies for ${targetRole} (such as ${anchors.slice(0, 3).join(', ')}).`);
  }

  // Check if Skills & Match Quality score is below 40% of the maximum weight, or zero anchors matched
  const skillsMaxWeight = roleWeights.skills || 40;
  const skillsScoreVal = breakdown.skills || 0;
  const isMismatched = ((skillsScoreVal / skillsMaxWeight) < 0.4) || hasZeroAnchors;

  // Collect missing sections
  const missingSections = [];
  if (!hasSummaryHeader) missingSections.push('Professional Summary');
  if (!hasEducationHeader) missingSections.push('Education');
  if (!hasSkillsHeader) missingSections.push('Technical Skills');
  if (!hasProjectsHeader) missingSections.push('Projects');
  if (!hasExperienceHeader) missingSections.push('Work Experience');

  // Justifications Setup
  const contactDetected = [];
  const contactMissing = [];
  if (hasEmail) contactDetected.push('Email'); else contactMissing.push('Email');
  if (hasPhone) contactDetected.push('Phone'); else contactMissing.push('Phone');
  if (hasLocation) contactDetected.push('Location'); else contactMissing.push('Location');
  
  const hasGithub = /github\.com/i.test(normalizedText);
  const hasLinkedin = /linkedin\.com/i.test(normalizedText);
  const hasPortfolio = /portfolio|leetcode|gitlab|bitbucket|dribbble|behance/i.test(normalizedText);

  if (hasGithub) contactDetected.push('GitHub Link'); else contactMissing.push('GitHub Link');
  if (hasLinkedin) contactDetected.push('LinkedIn Link'); else contactMissing.push('LinkedIn Link');
  if (hasPortfolio) contactDetected.push('Portfolio Link'); else contactMissing.push('Portfolio Link');

  const formattingDetected = [];
  const formattingMissing = [];
  if (hasSummaryHeader) formattingDetected.push('Professional Summary Section'); else formattingMissing.push('Professional Summary Section');
  if (hasEducationHeader) formattingDetected.push('Education Section'); else formattingMissing.push('Education Section');
  if (hasSkillsHeader) formattingDetected.push('Skills Section'); else formattingMissing.push('Skills Section');
  if (hasProjectsHeader) formattingDetected.push('Projects Section'); else formattingMissing.push('Projects Section');
  if (hasExperienceHeader) formattingDetected.push('Experience Section'); else formattingMissing.push('Experience Section');
  if (hasDates) formattingDetected.push('Standard Year/Date Chronology'); else formattingMissing.push('Standard Year/Date Chronology');
  if (hasBullets) formattingDetected.push('Bulleted Work Layout'); else formattingMissing.push('Bulleted Work Layout');

  const skillsDetected = matchedSkillsList.map(s => s.charAt(0).toUpperCase() + s.slice(1));
  const skillsMissing = [];
  essentialSkillsStrings.concat(recommendedSkillsStrings).forEach(skill => {
    if (!matchedSkillsList.some(s => s.toLowerCase().startsWith(skill.toLowerCase()))) {
      skillsMissing.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  });

  const experienceDetected = [];
  const experienceMissing = [];
  const gpaRegex = /\b(?:gpa|cgpa)\b\s*(?:of\s*)?([3-4]\.\d+|[8-9]\.\d+|10(?:\.0)?)\b|\b(?:dean's\s*list|academic\s*excellence|first\s*class|distinction|graduated\s*with\s*honors)\b/i;
  const chapterRegex = /\b(?:hackathon|ieee|acm|gdsc|club|society|volunteer|organizer|chapter|contribution|open\s*source|github|pr|pull\s*request)\b/i;

  if (isFresher) {
    experienceDetected.push('Fresher Safeguard Routed');
    if (gpaRegex.test(normalizedText)) experienceDetected.push('Strong GPA/Grades Performance'); else experienceMissing.push('CGPA/GPA Mentions');
    if (chapterRegex.test(normalizedText)) experienceDetected.push('Core Technical Chapter/Society Contributions'); else experienceMissing.push('Core Technical Chapter/Society Contributions');
  } else if (hasExperienceHeader || expTargetText.trim().length > 0) {
    const escapedTitles = experienceTitles.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
    const titleRegex = new RegExp(`\\b(?:${escapedTitles})\\b`, 'i');
    if (titleRegex.test(expTargetText)) experienceDetected.push('Developer/Intern Title Alignment'); else experienceMissing.push('Developer/Intern Title Alignment');

    experienceCriteria.forEach(crit => {
      const pts = Math.min(crit.maxPoints, crit.evaluate(expTargetText));
      if (pts >= crit.maxPoints / 2) {
        experienceDetected.push(crit.name);
      } else {
        experienceMissing.push(crit.name);
      }
    });

    const leadershipRegex = /\b(?:led|managed|spearheaded|coordinated|mentored|mentorship|lead|ownership|architected|collaborated|team)\b/gi;
    const leadMatches = new Set(expTargetText.toLowerCase().match(leadershipRegex) || []);
    if (leadMatches.size >= 2) {
      experienceDetected.push('Leadership & Ownership (Mentorship/Agile/Scrum)');
    } else if (leadMatches.size > 0) {
      experienceDetected.push('Team Collaboration');
      experienceMissing.push('Leadership & Ownership (Mentorship/Agile/Scrum)');
    } else {
      experienceMissing.push('Leadership & Ownership (Mentorship/Agile/Scrum)');
    }

    const impactMetricRegex = /\b(?:\d+%\s*|\$\d+|\d+\s*x\s*|latency|throughput|uptime|test coverage)\b|\b\d+(?:\s*[kKmM]\+?)?\s*(?:active\s*)?(?:users|requests|queries|records|endpoints|tasks|jobs|servers|databases|gb|tb|mb|kb|percent|%)\b|\b(?:reduced|optimized|improved|increased|saved|scaled|sped)\s+by\s+\b(?:\d+|some|several)\b/gi;
    const metricsCount = (expTargetText.match(impactMetricRegex) || []).length;
    if (metricsCount >= 2) {
      experienceDetected.push('Multiple Quantifiable Business Metrics');
    } else if (metricsCount > 0) {
      experienceDetected.push('Single Business Metric');
      experienceMissing.push('Multiple Quantifiable Business Metrics');
    } else {
      experienceMissing.push('Multiple Quantifiable Business Metrics');
    }

    if (dateRangeRegex.test(expTargetText)) experienceDetected.push('Chronological Date Ranges'); else experienceMissing.push('Chronological Date Ranges');
  } else {
    experienceMissing.push('Work Experience Section Missing');
  }

  const projectsDetected = [];
  const projectsMissing = [];
  if (hasProjectsHeader || projTargetText.trim().length > 0) {
    projectConcepts.forEach(dim => {
      if (dim.regex.test(projTargetText)) {
        projectsDetected.push(dim.name);
      } else {
        projectsMissing.push(dim.name);
      }
    });
  } else {
    projectsMissing.push('Projects Section Missing');
  }

  const educationDetected = [];
  const educationMissing = [];
  if (relevantDegreeRegex.test(eduTargetText)) {
    educationDetected.push('Relevant STEM/CS Degree');
  } else if (bootcampRegex.test(eduTargetText)) {
    educationDetected.push('Bootcamp/Technical Certification');
    educationMissing.push('Relevant STEM/CS Degree');
  } else {
    educationMissing.push('Relevant STEM/CS Degree');
  }
  if (universityRegex.test(eduTargetText)) educationDetected.push('University/College Affiliation'); else educationMissing.push('University/College Affiliation');
  if (dateRangeRegex.test(eduTargetText) || singleDateRegex.test(eduTargetText)) educationDetected.push('Expected/Completed Dates'); else educationMissing.push('Expected/Completed Dates');

  const keywordsDetected = [];
  const keywordsMissing = [];
  industryKeywords.forEach(kw => {
    if (new RegExp('\\b' + kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i').test(normalizedText)) {
      keywordsDetected.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    } else {
      keywordsMissing.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  });

  const achievementsDetected = [];
  const achievementsMissing = [];
  if (metricCheck) achievementsDetected.push('Quantifiable Business Metrics'); else achievementsMissing.push('Quantifiable Business Metrics');
  if (recognitionRegex.test(achTargetText)) achievementsDetected.push('Leadership/Honors/Awards'); else achievementsMissing.push('Leadership/Honors/Awards');

  const justifications = {
    contact: {
      score: breakdown.contact,
      max: roleWeights.contact,
      detected: contactDetected,
      missing: contactMissing
    },
    formatting: {
      score: breakdown.formatting,
      max: roleWeights.formatting,
      detected: formattingDetected,
      missing: formattingMissing
    },
    skills: {
      score: breakdown.skills,
      max: roleWeights.skills,
      detected: skillsDetected,
      missing: skillsMissing
    },
    experience: {
      score: breakdown.experience,
      max: roleWeights.experience,
      detected: experienceDetected,
      missing: experienceMissing
    },
    projects: {
      score: breakdown.projects,
      max: roleWeights.projects,
      detected: projectsDetected,
      missing: projectsMissing
    },
    education: {
      score: breakdown.education,
      max: roleWeights.education,
      detected: educationDetected,
      missing: educationMissing
    },
    keywords: {
      score: breakdown.keywords,
      max: roleWeights.keywords,
      detected: keywordsDetected,
      missing: keywordsMissing
    },
    achievements: {
      score: breakdown.achievements,
      max: roleWeights.achievements,
      detected: achievementsDetected,
      missing: achievementsMissing
    }
  };

  let compatibilityLabel = 'Moderate Match';
  if (isMismatched) {
    compatibilityLabel = 'Mismatched Profile';
  } else if (overallScore >= 90) {
    compatibilityLabel = 'Excellent Match';
  } else if (overallScore >= 80) {
    compatibilityLabel = 'Strong Match';
  } else if (overallScore >= 70) {
    compatibilityLabel = 'Good Match';
  } else if (overallScore >= 60) {
    compatibilityLabel = 'Moderate Match';
  } else if (overallScore >= 50) {
    compatibilityLabel = 'Weak Match';
  } else {
    compatibilityLabel = 'Low Match';
  }

  logger.info('ATSScorer', `Universal Dynamic Scorer Complete. Score: ${overallScore}/100. Career Stage: ${isFresher ? 'Fresher' : 'Experienced'}. Compatibility: ${compatibilityLabel}`);

  return {
    overallScore,
    breakdown,
    weights: roleWeights,
    justifications,
    strengths,
    weaknesses,
    recommendations,
    missingSections,
    detectedSkills: matchedSkillsList,
    isMismatched,
    compatibilityLabel
  };
};

module.exports = {
  scoreResume
};
