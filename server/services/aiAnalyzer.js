/**
 * @file aiAnalyzer.js
 * @description Service layer for analyzing resume text using NVIDIA Nemotron via OpenRouter API.
 * Contains resume insights, skill gap comparison, and interview prep questions generators.
 * Safely falls back to high-quality developer mocks if the API key is missing or credit-locked.
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');
const groundingValidator = require('./groundingValidator');
const aiResponseValidator = require('./aiResponseValidator');

const { OPENROUTER } = constants;

/**
 * Helper to pause execution for a given number of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clean up markdown wrapper formatting (such as ```json ... ```) that the LLM might include in its response.
 * @param {string} rawText - Raw text content from the completion.
 * @returns {string} - Cleaned JSON string.
 */
const cleanJsonString = (rawText) => {
  let cleaned = rawText.trim();
  
  // Find first { and last } to extract JSON block if preamble exists
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  return cleaned.trim();
};

const env = require('../config/env');

// Validate API key format on startup/loading
const apiKey = env.OPENROUTER_API_KEY;
if (apiKey && !apiKey.startsWith('sk-or-')) {
  logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY does not start with standard "sk-or-" prefix. API calls may fail.');
}

const OPENROUTER_MODELS = [
  env.AI.MODEL_ID,
  'google/gemini-2.5-flash:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-coder-32b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'openrouter/free'
];

/**
 * Checks if the error returned from OpenRouter is terminal (e.g. key invalid, credit/daily limit reached).
 * @param {Error} error
 * @returns {boolean}
 */
const isTerminalError = (error) => {
  if (!error || !error.message) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('401') || 
         msg.includes('402') || 
         msg.includes('credit limit') || 
         msg.includes('insufficient credit') ||
         msg.includes('payment required');
};

/**
 * Helper to check if a skill exists in the resume text or detectedSkills array.
 * @param {string} skill - The skill to check.
 * @param {string} resumeText - The full resume text.
 * @param {string[]} detectedSkills - The list of detected skills.
 * @returns {boolean}
 */
const isSkillInResume = (skill, resumeText, detectedSkills) => {
  if (!skill) return false;
  const cleanSkill = skill.toLowerCase().trim();
  
  // 1. Check in detectedSkills array
  if (detectedSkills && Array.isArray(detectedSkills)) {
    if (detectedSkills.some(s => {
      const cleanS = (s || '').toLowerCase().trim();
      return cleanS === cleanSkill || cleanS.includes(cleanSkill) || cleanSkill.includes(cleanS);
    })) {
      return true;
    }
  }
  
  // 2. Check in resumeText
  if (resumeText) {
    const cleanText = resumeText.toLowerCase();
    
    // Substring match
    if (cleanText.includes(cleanSkill)) {
      return true;
    }
    
    // Check common abbreviations/aliases
    const aliases = {
      'js': ['javascript'],
      'javascript': ['js'],
      'ts': ['typescript'],
      'typescript': ['ts'],
      'git': ['github', 'gitlab'],
      'aws': ['amazon web services'],
      'gcp': ['google cloud'],
      'ci/cd': ['ci', 'cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
      'docker': ['containerization', 'containers'],
      'networking': ['networks', 'tcp/ip', 'dns', 'routing', 'switching']
    };
    
    const skillAliases = aliases[cleanSkill];
    if (skillAliases) {
      for (const alias of skillAliases) {
        if (cleanText.includes(alias)) {
          return true;
        }
      }
    }
  }
  
  return false;
};

/**
 * Validates the parsed JSON object to ensure it contains all required resume analysis fields.
 * @param {object} obj - Parsed JSON object.
 * @returns {boolean} - True if valid, false otherwise.
 */
const validateRoleBasedAtsResult = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  if (typeof obj.strengths === 'string') obj.strengths = [obj.strengths];
  if (typeof obj.weaknesses === 'string') obj.weaknesses = [obj.weaknesses];
  if (typeof obj.missingKeywords === 'string') obj.missingKeywords = [obj.missingKeywords];
  if (typeof obj.recommendations === 'string') obj.recommendations = [obj.recommendations];

  return typeof obj.atsScore === 'number' &&
         Array.isArray(obj.strengths) &&
         Array.isArray(obj.weaknesses) &&
         Array.isArray(obj.missingKeywords) &&
         Array.isArray(obj.recommendations) &&
         typeof obj.roleFit === 'string';
};

const getMockRoleBasedAtsRaw = (targetRole = 'Software Engineer') => {
  const r = (targetRole || '').toLowerCase();
  
  if (r.includes('front') || r.includes('react') || r.includes('ui/ux') || r.includes('designer') || r.includes('design')) {
    if (r.includes('designer') || r.includes('ux') || r.includes('design')) {
      return {
        atsScore: 78,
        strengths: [
          "Demonstrated experience with UI design concepts and tools.",
          "Good understanding of user-centric design principles."
        ],
        weaknesses: [
          "Lacks detailed design systems documentation experience.",
          "No mention of component auto-layout principles or library standards.",
          "Insufficient details on interactive prototyping and user research studies."
        ],
        missingKeywords: ["Figma", "Design Systems", "Prototyping", "User Research", "Wireframing"],
        recommendations: [
          "Add details about building reusable component libraries and using auto-layout.",
          "Incorporate case studies highlighting user persona creation and user testing.",
          "Emphasize experience collaborating with developers using handoff tools."
        ],
        roleFit: "The candidate shows good visual design instincts but needs to highlight more structured design system processes and user research methodologies."
      };
    } else {
      return {
        atsScore: 82,
        strengths: [
          "Strong experience with modern frontend frameworks (React, JavaScript).",
          "Semantic markup and styling with CSS Grid and Tailwind CSS.",
          "Demonstrated project delivery with version control using Git."
        ],
        weaknesses: [
          "Lacks state management depth (Redux/Zustand is not mentioned).",
          "No mention of frontend testing frameworks (Jest, Cypress).",
          "Web accessibility (a11y) standards compliance is not detailed."
        ],
        missingKeywords: ["Redux", "Accessibility", "Jest", "Cypress", "Lighthouse"],
        recommendations: [
          "Incorporate state management tools like Redux Toolkit to showcase architecture skills.",
          "Add unit testing coverage using Jest or React Testing Library.",
          "Include statements detailing your experience optimizing web accessibility."
        ],
        roleFit: "The candidate has a strong foundation in frontend engineering but needs to add modern state management and automated testing to fully meet role expectations."
      };
    }
  } else if (r.includes('back') || r.includes('node') || r.includes('server') || r.includes('api') || r.includes('backend')) {
    return {
      atsScore: 75,
      strengths: [
        "Solid foundations in backend scripting and API building with Node.js.",
        "Demonstrated familiarity with relational databases and SQL query basics.",
        "Good understanding of backend modularity and version control."
      ],
      weaknesses: [
        "No mention of advanced caching mechanisms or message brokers.",
        "Missing containerization experience (Docker, Kubernetes).",
        "Lacks API security protocols and complex database query optimization details."
      ],
      missingKeywords: ["PostgreSQL", "Redis", "Docker", "JWT", "API Security", "NoSQL"],
      recommendations: [
        "Quantify backend performance optimizations (e.g. reduced API response latency by 15%).",
        "Add experience with dockerizing backend apps and integrating secure JWT authentication.",
        "Detail your work with non-relational databases or caching layers like Redis."
      ],
      roleFit: "The candidate is competent in core backend scripting but needs to incorporate modern microservices, security, and containerization strategies."
    };
  } else if (r.includes('full stack') || r.includes('fullstack')) {
    return {
      atsScore: 79,
      strengths: [
        "Verifiable experience working across both frontend and backend parts of web applications.",
        "Competence in HTML/CSS/JavaScript and backend server environments.",
        "Familiarity with database integrations and full-lifecycle project builds."
      ],
      weaknesses: [
        "Lacks deep structural system design and architectural scalability details.",
        "No clear mention of comprehensive end-to-end testing (Cypress/Integration testing).",
        "Missing cloud deployment automation and cloud database configurations."
      ],
      missingKeywords: ["React", "PostgreSQL", "System Architecture", "Docker", "CI/CD", "AWS"],
      recommendations: [
        "Clarify your role in system design decisions and scalable backend structure.",
        "Add containerization and automated CI/CD pipeline building to your project details.",
        "Emphasize unit/integration testing on both front and back ends."
      ],
      roleFit: "The candidate has a versatile background across the stack but lacks documented experience with advanced system scaling, cloud ops, and testing."
    };
  } else if (r.includes('ai') || r.includes('machine learning') || r.includes('ml') || r.includes('deep learning') || r.includes('data scientist')) {
    if (r.includes('data scientist')) {
      return {
        atsScore: 70,
        strengths: [
          "Good foundation in statistical analysis and Python scripting.",
          "Familiarity with query languages like SQL to retrieve data."
        ],
        weaknesses: [
          "No mention of exploratory data analysis libraries (Pandas, NumPy).",
          "Missing machine learning algorithm implementation and model selection details.",
          "Lacks experience with A/B testing methodologies and visualization dashboards."
        ],
        missingKeywords: ["Pandas", "Scikit-Learn", "A/B Testing", "Tableau", "PowerBI", "BigQuery"],
        recommendations: [
          "Highlight data manipulation projects using Pandas, NumPy, and Scikit-Learn.",
          "Describe how you designed A/B tests or synthesized business insights using visualization tools.",
          "Detail data cleansing and pipeline automation methods."
        ],
        roleFit: "The candidate possesses basic analytical skills but needs to demonstrate more hands-on data science libraries, model building, and evaluation metrics."
      };
    } else {
      return {
        atsScore: 60,
        strengths: [
          "Basic Python programming and logic fundamentals are present.",
          "Good understanding of basic data processing and backend integration."
        ],
        weaknesses: [
          "No evidence of machine learning frameworks (TensorFlow, PyTorch).",
          "Missing experience with data processing pipelines or ML model deployment.",
          "Lacks mathematical or statistical background details on model evaluation."
        ],
        missingKeywords: ["Python", "TensorFlow", "PyTorch", "MLOps", "Pandas", "Scikit-Learn", "Pinecone"],
        recommendations: [
          "Transition experience to show Python-based data modeling or data extraction.",
          "List hands-on projects featuring PyTorch or TensorFlow model tuning.",
          "Add qualifications or certifications in Machine Learning and MLOps practices."
        ],
        roleFit: "The candidate's profile is heavily focused on general software development and currently shows insufficient alignment with the technical requirements of an AI/ML Engineer role."
      };
    }
  } else if (r.includes('cyber') || r.includes('security') || r.includes('pentest')) {
    return {
      atsScore: 66,
      strengths: [
        "Good understanding of networking basics and operating system controls.",
        "Familiarity with Python scripting and general administrative tasks."
      ],
      weaknesses: [
        "No explicit mention of penetration testing methodologies or threat modeling.",
        "Missing hands-on experience with security monitoring or SIEM systems.",
        "Lacks details on cryptographic protocols or web application security standards (OWASP)."
      ],
      missingKeywords: ["Penetration Testing", "Vulnerability Analysis", "OWASP", "Wireshark", "Splunk", "SIEM"],
      recommendations: [
        "Detail experience performing vulnerability scans and identifying security issues.",
        "Highlight familiar security tools like Kali Linux, Burp Suite, and Wireshark.",
        "Mention security certifications (CompTIA Security+, CEH) and understanding of OWASP Top 10."
      ],
      roleFit: "The candidate has basic technical security awareness but lacks experience with dedicated security auditing, threat hunting, and compliance tools."
    };
  } else if (r.includes('data analyst') || r.includes('analyst') || r.includes('sql')) {
    return {
      atsScore: 74,
      strengths: [
        "Strong fundamentals in SQL queries and Excel data management.",
        "Good experience with report drafting and general business communication."
      ],
      weaknesses: [
        "No mention of advanced BI reporting tools (Tableau, PowerBI).",
        "Missing programmatic data analysis tools (Python Pandas/R).",
        "Lacks details on data warehousing concepts or ETL pipelines."
      ],
      missingKeywords: ["Pandas", "Tableau", "PowerBI", "BigQuery", "ETL", "Data Cleansing"],
      recommendations: [
        "Add experience cleaning and transforming messy datasets programmatically.",
        "Emphasize building dynamic, interactive business dashboards in Tableau or PowerBI.",
        "Detail experience with Google BigQuery or other modern cloud data warehouses."
      ],
      roleFit: "The candidate has standard business analysis skills but needs to adopt modern programmatic data tools and dashboard design to match current standards."
    };
  } else if (r.includes('devops') || r.includes('site reliability') || r.includes('sre')) {
    return {
      atsScore: 68,
      strengths: [
        "Linux administration skills and command line competency.",
        "Strong version control practices and code management with Git."
      ],
      weaknesses: [
        "Missing automated CI/CD pipeline configuration details.",
        "No experience with Infrastructure as Code (IaC) tools like Terraform.",
        "Lacks container orchestration setup (Kubernetes)."
      ],
      missingKeywords: ["CI/CD", "Terraform", "Kubernetes", "Docker", "AWS", "Grafana"],
      recommendations: [
        "Add explicit examples of configuring GitHub Actions or Jenkins CI/CD pipelines.",
        "Detail projects where you provisioned cloud infrastructure using Terraform.",
        "Showcase experience containerizing applications and running them on Kubernetes clusters."
      ],
      roleFit: "The candidate has solid IT operations foundations but lacks the modern automation, cloud, and orchestration skills required for DevOps roles."
    };
  } else if (r.includes('cloud') || r.includes('aws') || r.includes('azure') || r.includes('gcp')) {
    return {
      atsScore: 72,
      strengths: [
        "Familiarity with cloud concepts and Linux computing.",
        "Version control knowledge using Git."
      ],
      weaknesses: [
        "Lacks detailed provisioning of cloud infrastructure services (AWS, Azure, GCP).",
        "No evidence of Infrastructure as Code or cloud security controls.",
        "Missing serverless framework deployment or container setup."
      ],
      missingKeywords: ["AWS", "Terraform", "Cloud Security", "Docker", "Serverless", "IAM"],
      recommendations: [
        "Detail your hand-on experience with specific cloud resources (EC2, S3, IAM, Lambda).",
        "Show how you secure cloud infrastructure through fine-grained permissions.",
        "Include cloud certifications or IaC code repositories to demonstrate capability."
      ],
      roleFit: "The candidate is cloud-aware but needs to show hands-on experience provisioning, securing, and deploying enterprise-level cloud infrastructure."
    };
  } else if (r.includes('mobile') || r.includes('ios') || r.includes('android') || r.includes('flutter') || r.includes('cordova')) {
    return {
      atsScore: 73,
      strengths: [
        "Excellent programming skills with JavaScript and web frameworks.",
        "Strong understanding of responsive layouts and basic styling."
      ],
      weaknesses: [
        "No mention of mobile app frameworks (React Native, Flutter, Swift, Kotlin).",
        "Missing details about mobile app lifecycle, state management, or local databases.",
        "Lacks app store deployment and build optimization experience."
      ],
      missingKeywords: ["React Native", "Flutter", "Swift", "Kotlin", "App Store", "SQLite"],
      recommendations: [
        "Highlight projects built with React Native, Flutter, or native mobile technologies.",
        "Explain how you handle mobile-specific challenges (offline sync, push notifications).",
        "Describe your experience releasing and updating apps on Google Play or Apple App Store."
      ],
      roleFit: "The candidate has a solid web background but needs to emphasize mobile-specific frameworks, patterns, and deployment experience."
    };
  } else if (r.includes('qa') || r.includes('test') || r.includes('quality') || r.includes('automation')) {
    return {
      atsScore: 76,
      strengths: [
        "Strong background in manual testing and detailed bug reporting.",
        "Familiarity with tracking tools like Jira and version control with Git."
      ],
      weaknesses: [
        "No experience with test automation libraries (Selenium, Cypress).",
        "Lacks API testing and automation verification experience.",
        "Missing integration of automated tests in CI/CD build scripts."
      ],
      missingKeywords: ["Automation Testing", "Selenium", "Cypress", "Postman", "API Testing", "JMeter"],
      recommendations: [
        "Include automated testing scripts built with Cypress or Selenium in your portfolio.",
        "Describe how you construct API assertions using Postman or Supertest.",
        "Showcase performance or load testing skills with JMeter."
      ],
      roleFit: "The candidate is an experienced manual tester but needs to build and showcase modern test automation and API verification skills."
    };
  } else if (r.includes('product') || r.includes('pm') || r.includes('management')) {
    return {
      atsScore: 77,
      strengths: [
        "Strong interpersonal communication and team coordination skills.",
        "Familiarity with Agile software development and product lifecycle."
      ],
      weaknesses: [
        "No clear examples of drafting Product Requirement Documents (PRDs).",
        "Missing data-driven product analytics or A/B testing details.",
        "Lacks experience with roadmap planning and backlog prioritization software."
      ],
      missingKeywords: ["PRD", "A/B Testing", "Amplitude", "Mixpanel", "Jira", "Roadmapping"],
      recommendations: [
        "Highlight your ability to write clear PRDs, epics, and user stories.",
        "Mention using product analytics tools (Amplitude, Mixpanel) to measure product success.",
        "Describe your role in prioritizing features and negotiating timelines using Scrum."
      ],
      roleFit: "The candidate is a solid project coordinator but needs to demonstrate product ownership, metrics-driven decisions, and structured requirements gathering."
    };
  } else {
    return {
      atsScore: 65,
      strengths: [
        "Good core software engineering practices.",
        "Clear project descriptions and technical stack definitions."
      ],
      weaknesses: [
        "Could benefit from more quantifiable achievements.",
        "Target role specific competencies are not fully emphasized."
      ],
      missingKeywords: ["CI/CD", "Unit Testing", "System Architecture"],
      recommendations: [
        "Quantify your experience bullet points with metrics (e.g. performance improvements, user engagement).",
        "Add targeted tech stack keywords that align directly with the role requirements."
      ],
      roleFit: "The candidate shows good general software engineering capabilities but needs to align their resume more closely with target role expectations."
    };
  }
};

const addCategoryExplanations = (mockObj) => {
  mockObj.categoryExplanations = {
    contact: "The contact section includes standard communication channels.",
    formatting: "The resume follows standard structural sections.",
    skills: "The skills section contains common industry keywords.",
    experience: "The professional experience lists relevant roles and tasks.",
    projects: "The projects section details technical builds and stacks.",
    education: "The education section includes academic credentials.",
    keywords: "The keyword density is average for this role.",
    achievements: "Quantified business metrics are present or can be improved."
  };
  delete mockObj.atsScore;
  return mockObj;
};

const getMockRoleBasedAts = (targetRole = 'Software Engineer') => {
  const raw = getMockRoleBasedAtsRaw(targetRole);
  return addCategoryExplanations(raw);
};

const getMockSkillGap = (role, resumeText = '', detectedSkills = []) => {
  const r = (role || '').toLowerCase();
  
  let potentialMatched = [];
  let potentialMissing = [];
  let potentialRecommended = [];
  let learningRoadmap = [];
  
  // Set up role-specific pools
  if (r.includes('front') || r.includes('react') || r.includes('ui/ux') || r.includes('designer') || r.includes('design')) {
    if (r.includes('designer') || r.includes('ux') || r.includes('design')) {
      potentialMatched = ["Figma", "Wireframing", "User Research", "Visual Design"];
      potentialMissing = ["Component Libraries / Auto-layout", "Interactive Prototyping", "Design System Documentation"];
      potentialRecommended = ["HTML5 & CSS3 Basics", "User Persona Synthesis", "Micro-interactions"];
      learningRoadmap = [
        "Phase 1: Build responsive Figma layouts using Auto-Layout and Variants (2 weeks)",
        "Phase 2: Design interactive animations and user flows in Figma (2 weeks)",
        "Phase 3: Conduct user testing interviews and synthesize feedback (2 weeks)"
      ];
    } else {
      potentialMatched = ["HTML5", "CSS3", "JavaScript (ES6+)"];
      potentialMissing = ["React 18+", "TypeScript Type Safety", "Next.js / Server-Side Rendering"];
      potentialRecommended = ["Tailwind CSS Layouts", "Jest / RTL Testing", "Redux Toolkit"];
      learningRoadmap = [
        "Phase 1: Master React components and state management (2 weeks)",
        "Phase 2: Learn TypeScript syntax and compiler rules (2 weeks)",
        "Phase 3: Build Next.js SSR/ISR projects with Tailwind (3 weeks)"
      ];
    }
  } else if (r.includes('back') || r.includes('node') || r.includes('server') || r.includes('api') || r.includes('backend')) {
    potentialMatched = ["JavaScript", "Node.js", "Express.js APIs", "SQL Basics"];
    potentialMissing = ["PostgreSQL database integration", "Redis Caching", "Docker Containerization"];
    potentialRecommended = ["JWT Authentication", "MongoDB", "RESTful Best Practices"];
    learningRoadmap = [
      "Phase 1: Design relational database schemas and write complex SQL queries (2 weeks)",
      "Phase 2: Containerize backend server using Docker (1 week)",
      "Phase 3: Setup Redis caching layer for heavy endpoints (2 weeks)"
    ];
  } else if (r.includes('full stack') || r.includes('fullstack')) {
    potentialMatched = ["HTML5", "CSS3", "JavaScript", "Node.js"];
    potentialMissing = ["React Components", "PostgreSQL", "System Architecture Design"];
    potentialRecommended = ["JWT Authentication", "Docker Containerization", "Git workflows"];
    learningRoadmap = [
      "Phase 1: Build robust React frontend interfaces (2 weeks)",
      "Phase 2: Structure Express backend with SQL database (2 weeks)",
      "Phase 3: Study deployment strategies and security (2 weeks)"
    ];
  } else if (r.includes('ai') || r.includes('machine learning') || r.includes('ml') || r.includes('deep learning') || r.includes('data scientist')) {
    if (r.includes('data scientist')) {
      potentialMatched = ["Python", "SQL", "Statistics Basics"];
      potentialMissing = ["Jupyter Notebooks / Pandas / NumPy", "Scikit-Learn Algorithms", "A/B Testing"];
      potentialRecommended = ["Matplotlib/Seaborn Visualization", "Tableau/PowerBI", "BigQuery"];
      learningRoadmap = [
        "Phase 1: Perform Exploratory Data Analysis (EDA) on datasets (2 weeks)",
        "Phase 2: Build predictive classification & regression models (3 weeks)",
        "Phase 3: Learn A/B testing methodology (1 week)"
      ];
    } else {
      potentialMatched = ["Python", "Basic Machine Learning Algorithms", "SQL"];
      potentialMissing = ["PyTorch / TensorFlow", "Hugging Face Transformers", "LLM Fine-tuning / RAG"];
      potentialRecommended = ["Vector Databases (Pinecone/Milvus)", "Docker Deployment", "MLOps Pipelines"];
      learningRoadmap = [
        "Phase 1: Deepen Deep Learning basics on Coursera (2-3 weeks)",
        "Phase 2: Complete the Hugging Face NLP Course (3-4 weeks)",
        "Phase 3: Implement fine-tuning models and store vectors in Pinecone (2 weeks)"
      ];
    }
  } else if (r.includes('cyber') || r.includes('security') || r.includes('pentest')) {
    potentialMatched = ["Linux", "Python scripting", "Basic Networking"];
    potentialMissing = ["Penetration Testing (Kali Linux/Burp Suite)", "Threat Vulnerability Analysis", "Cryptographic Protocols"];
    potentialRecommended = ["OWASP Top 10", "Network Traffic Analysis (Wireshark)", "SIEM Tools (Splunk)"];
    learningRoadmap = [
      "Phase 1: Study Network Security and Cryptography fundamentals (2 weeks)",
      "Phase 2: Identify and exploit OWASP Top 10 vulnerabilities (3 weeks)",
      "Phase 3: Analyze network traffic logs in Wireshark (2 weeks)"
    ];
  } else if (r.includes('data analyst') || r.includes('analyst') || r.includes('sql')) {
    potentialMatched = ["SQL", "Excel", "Basic Analytics"];
    potentialMissing = ["Python Pandas", "Tableau/PowerBI Dashboards", "Data Cleansing Techniques"];
    potentialRecommended = ["Google BigQuery", "Statistical Methods", "Data Warehousing"];
    learningRoadmap = [
      "Phase 1: Master advanced SQL query functions (window functions, CTEs) (2 weeks)",
      "Phase 2: Learn Tableau/PowerBI dashboard design principles (2 weeks)",
      "Phase 3: Clean messy datasets using Python Pandas (2 weeks)"
    ];
  } else if (r.includes('devops') || r.includes('site reliability') || r.includes('sre')) {
    potentialMatched = ["Linux Command Line", "Git workflows", "Basic Networking"];
    potentialMissing = ["CI/CD Pipelines (GitHub Actions/Jenkins)", "Terraform Infrastructure as Code", "Kubernetes Orchestration"];
    potentialRecommended = ["Docker", "AWS Cloud Services", "Prometheus/Grafana Monitoring"];
    learningRoadmap = [
      "Phase 1: Create automatic build/test CI/CD pipelines (2 weeks)",
      "Phase 2: Write Terraform scripts to provision infrastructure (2 weeks)",
      "Phase 3: Master Kubernetes clusters and manifest files (3 weeks)"
    ];
  } else if (r.includes('cloud') || r.includes('aws') || r.includes('azure') || r.includes('gcp')) {
    potentialMatched = ["Linux", "Git", "Basic Cloud Concepts"];
    potentialMissing = ["AWS Core Services (EC2, S3, IAM, Lambda)", "Terraform IaC", "Cloud Security Auditing"];
    potentialRecommended = ["Docker", "Serverless Frameworks", "GCP/Azure"];
    learningRoadmap = [
      "Phase 1: Pass AWS Certified Solutions Architect Associate (3 weeks)",
      "Phase 2: Build serverless backends with Lambda and API Gateway (2 weeks)",
      "Phase 3: Secure cloud infrastructure using IAM roles (1 week)"
    ];
  } else if (r.includes('mobile') || r.includes('ios') || r.includes('android') || r.includes('flutter') || r.includes('cordova')) {
    potentialMatched = ["JavaScript", "HTML/CSS", "Git"];
    potentialMissing = ["React Native / Flutter", "Swift (iOS) / Kotlin (Android)", "App Store Deployment"];
    potentialRecommended = ["Mobile UI Design", "SQLite/Room Database", "Push Notifications"];
    learningRoadmap = [
      "Phase 1: Build cross-platform apps with React Native or Flutter (3 weeks)",
      "Phase 2: Study native components and build layouts in Swift/Kotlin (3 weeks)",
      "Phase 3: Configure app certificates and deploy to stores (1 week)"
    ];
  } else if (r.includes('qa') || r.includes('test') || r.includes('quality') || r.includes('automation')) {
    potentialMatched = ["Manual Testing", "Bug Reporting", "Git"];
    potentialMissing = ["Automation Testing (Selenium/Cypress)", "API Testing (Postman)", "CI/CD Integration"];
    potentialRecommended = ["Test Case Design", "Performance Testing (JMeter)", "SQL Queries"];
    learningRoadmap = [
      "Phase 1: Write end-to-end automation scripts in Cypress/Selenium (3 weeks)",
      "Phase 2: Build collections for API test validation in Postman (2 weeks)",
      "Phase 3: Trigger automated test suites from GitHub Actions (1 week)"
    ];
  } else if (r.includes('product') || r.includes('pm') || r.includes('management')) {
    potentialMatched = ["Communication", "Presentation design", "Agile methodology"];
    potentialMissing = ["Product Requirement Documents (PRDs)", "A/B Testing & Product Analytics (Amplitude/Mixpanel)", "Technical Architecture basics"];
    potentialRecommended = ["Roadmapping tools (Jira/Productboard)", "User Research", "UX Prototyping"];
    learningRoadmap = [
      "Phase 1: Write comprehensive PRDs and user stories (2 weeks)",
      "Phase 2: Configure analytics dashboards and evaluate product metrics (2 weeks)",
      "Phase 3: Facilitate scrum ceremonies and release planning (2 weeks)"
    ];
  } else {
    potentialMatched = ["Algorithms", "Data Structures", "Git"];
    potentialMissing = ["System Design (Scalability, Microservices)", "Docker/CI-CD basics", "Unit Testing (TDD)"];
    potentialRecommended = ["API documentation (Swagger)", "Cloud Services (AWS)", "Database Indexing"];
    learningRoadmap = [
      "Phase 1: Write modular code covered by unit tests (2 weeks)",
      "Phase 2: Design scalable system architectures with microservices (3 weeks)",
      "Phase 3: Setup basic Docker dev environment and deploy (1 week)"
    ];
  }

  // Dynamic filter logic based on actual resumeText and detectedSkills
  const matchedSkills = [];
  const missingSkills = [];
  const recommendedSkills = [...potentialRecommended];

  const checkList = [...potentialMatched, ...potentialMissing];
  checkList.forEach(skill => {
    if (isSkillInResume(skill, resumeText, detectedSkills)) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  });

  // If no skills are matched, matchedSkills will remain empty, showing the user that there are no matched skills for this target role.

  const finalMissingSkills = missingSkills.filter(s => !matchedSkills.includes(s));
  if (finalMissingSkills.length === 0) {
    finalMissingSkills.push(...potentialMissing);
  }

  return {
    matchedSkills: matchedSkills,
    missingSkills: finalMissingSkills,
    recommendedSkills: recommendedSkills,
    learningRoadmap: learningRoadmap.map((item, idx) => {
      const match = item.match(/^(?:Phase\s+\d+:\s*)?([^(]+)(?:\(([^)]+)\))?/i);
      let title = item;
      let duration = '2 weeks';
      if (match) {
        title = match[1].trim();
        if (match[2]) {
          duration = match[2].trim();
        }
      }
      let topics = [];
      const topicsMatch = title.match(/(?:using|with|in)\s+([^,.]+)/i);
      if (topicsMatch) {
        topics = topicsMatch[1].split(/(?:,|\band\b)/).map(t => t.trim()).filter(Boolean);
      }
      if (topics.length === 0) {
        topics = [title];
      }
      return { title, duration, topics };
    })
  };
};

const extractProjectsFromText = (resumeText) => {
  const projects = [];
  if (!resumeText) return projects;

  const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);
  let inProjectSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Check if we enter the projects section
    if (
      (lowerLine.includes('project') || lowerLine.includes('portfolio') || lowerLine.includes('creations')) &&
      !lowerLine.includes('experience') &&
      !lowerLine.includes('skills') &&
      !lowerLine.includes('objective') &&
      line.length < 40
    ) {
      inProjectSection = true;
      continue;
    }

    // Check if we exit the projects section
    if (
      inProjectSection &&
      (lowerLine.includes('experience') ||
       lowerLine.includes('education') ||
       lowerLine.includes('skills') ||
       lowerLine.includes('certifications') ||
       lowerLine.includes('summary') ||
       lowerLine.includes('languages') ||
       lowerLine.includes('contact') ||
       lowerLine.includes('about me')) &&
      line.length < 40
    ) {
      inProjectSection = false;
    }

    if (inProjectSection) {
      // Look for lines that look like project titles:
      // Pattern 1: "Project: MyProjectName" or "Project Name: MyProjectName"
      const projectPrefixMatch = line.match(/^(?:project|title|name)\s*:\s*([A-Za-z0-9\s_-]{2,30})/i);
      if (projectPrefixMatch) {
        const pName = projectPrefixMatch[1].trim();
        if (pName && !projects.includes(pName)) {
          projects.push(pName);
          continue;
        }
      }

      // Pattern 2: A bullet point or start of line with a name, followed by " - " or " ( "
      // E.g. "- BioLynk - Healthcare app" or "* BioLynk (React/Node)" or "BioLynk - Health tracker"
      const separatorMatch = line.match(/^(?:[-*•\d\.\s]+)?([A-Z][A-Za-z0-9\s_-]{2,25})\s*(?:-|–|—|:|\(|—)/);
      if (separatorMatch) {
        const pName = separatorMatch[1].trim();
        // Exclude common starting action verbs or ignore keywords
        const ignoreList = [
          'Built', 'Created', 'Developed', 'Designed', 'Implemented', 'Using', 'Used', 'With', 'From',
          'Project', 'Personal', 'Academic', 'Selected', 'Key', 'June', 'July', 'August', 'September',
          'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'Summer'
        ];
        if (pName && !ignoreList.includes(pName) && !projects.includes(pName)) {
          projects.push(pName);
          continue;
        }
      }

      // Pattern 3: A short line (less than 35 characters) starting with capital letter, not ending in punctuation
      // E.g. "BioLynk Web Portal"
      if (line.length > 2 && line.length < 35 && /^[A-Z]/.test(line) && !/[.!?]$/.test(line)) {
        const ignoreList = [
          'Projects', 'Personal Projects', 'Academic Projects', 'Key Projects', 'Selected Projects',
          'Technical Stack', 'Technologies Used', 'Github Link', 'Live Demo'
        ];
        if (!ignoreList.some(ig => lowerLine.includes(ig.toLowerCase()))) {
          const pName = line.replace(/^[-*•\d\.\s]+/, '').trim();
          if (pName && !projects.includes(pName) && pName.length > 2 && pName.length < 30) {
            projects.push(pName);
          }
        }
      }
    }
  }

  // Fallback: search the entire text for "Project Name:" or similar if nothing found in section
  if (projects.length === 0) {
    for (const line of lines) {
      const match = line.match(/(?:project|title)\s*:\s*([A-Za-z0-9\s_-]{2,25})/i);
      if (match) {
        const pName = match[1].trim();
        if (pName && !projects.includes(pName)) {
          projects.push(pName);
        }
      }
    }
  }

  return projects;
};

const getMockInterviewQuestions = (targetRole = 'Software Engineer', detectedSkills = [], missingSkills = [], resumeText = '') => {
  const projects = extractProjectsFromText(resumeText);

  let techQuestions = [];
  const role = (targetRole || 'Software Engineer').toLowerCase();
  
  if (role.includes('front') || role.includes('react') || role.includes('ui/ux') || role.includes('designer') || role.includes('design')) {
    if (role.includes('designer') || role.includes('ux') || role.includes('design')) {
      techQuestions = [
        "What are the core visual design principles (such as hierarchy, alignment, contrast, proximity) and how do they apply to web UI?",
        "Explain the concept of design systems and how Figma components, styles, and variants promote consistency.",
        "How do you conduct user testing on a prototype, and how do you translate qualitative feedback into design iterations?",
        "What is the difference between wireframes, mockups, and high-fidelity interactive prototypes?",
        "How do you ensure user interfaces are accessible and meet WCAG contrast and screen-reader compatibility standards?"
      ];
    } else {
      techQuestions = [
        "Explain how JavaScript handles asynchronous operations using the event loop.",
        "What is the difference between state and props in React, and how does one-way data flow help?",
        "How do you optimize page load performance (e.g. lazy loading, minimizing bundles) in a modern frontend application?",
        "Explain the Virtual DOM and how React updates the UI efficiently.",
        "How do you implement secure client-side authentication and handle state management across private routes?"
      ];
    }
  } else if (role.includes('back') || role.includes('node') || role.includes('server') || role.includes('api') || role.includes('backend')) {
    techQuestions = [
      "Explain Node.js event-driven architecture and how it achieves non-blocking I/O.",
      "What are the key trade-offs between SQL (e.g., PostgreSQL) and NoSQL (e.g., MongoDB) databases?",
      "How would you design and implement a secure token-based authentication (JWT) flow on the backend?",
      "How do you approach database indexing and query optimization to handle millions of reads/writes?",
      "Explain the concept of horizontal vs. vertical scaling and how to design stateless API servers."
    ];
  } else if (role.includes('full stack') || role.includes('fullstack')) {
    techQuestions = [
      "Explain the process of data flow in a standard 3-tier architecture from client request to database write.",
      "How do you prevent common web vulnerabilities like Cross-Site Scripting (XSS) and SQL Injection in full-stack apps?",
      "What are the advantages of using RESTful APIs vs. GraphQL for client-server communication?",
      "Describe a strategy for syncing client state with server data, including handling network latency.",
      "How do you configure unified build, test, and containerized deployment scripts for both frontend and backend?"
    ];
  } else if (role.includes('ai') || role.includes('machine') || role.includes('learn') || role.includes('ml') || role.includes('deep learning')) {
    techQuestions = [
      "Explain the differences between supervised and unsupervised learning, and give examples of each.",
      "What is overfitting in neural networks, and what techniques (e.g. dropout, L1/L2) do you use to mitigate it?",
      "How do Transformer models use self-attention to process sequential data in NLP?",
      "What is MLOps, and how do you design a pipeline for automated model training, validation, and deployment?",
      "How do you select the appropriate loss function and optimizer when training a deep classifier?"
    ];
  } else if (role.includes('data scientist')) {
    techQuestions = [
      "What is the Central Limit Theorem, and why is it crucial for hypothesis testing?",
      "How do you handle highly imbalanced datasets when training classification models?",
      "Explain the mathematical difference between Ridge and Lasso regularization, and when to use which.",
      "Describe the evaluation metrics you would use for a recommendation engine vs. a regression model.",
      "How do you perform dimensional reduction using PCA, and how do you determine the optimal number of components?"
    ];
  } else if (role.includes('cyber') || role.includes('security') || role.includes('pentest')) {
    techQuestions = [
      "Explain how a Man-in-the-Middle (MitM) attack works and how SSL/TLS certificates mitigate it.",
      "What is the difference between symmetric and asymmetric encryption, and how are they used in HTTPS?",
      "How do you identify and mitigate the vulnerabilities described in the OWASP Top 10 list?",
      "What is a SIEM system, and how do you use network log analysis to detect potential intrusion attempts?",
      "Describe the process of a SQL injection attack and how parameterized queries prevent it."
    ];
  } else if (role.includes('data analyst') || role.includes('analyst') || role.includes('sql')) {
    techQuestions = [
      "Explain the differences between INNER JOIN, LEFT JOIN, and outer joins in SQL, and when to use window functions.",
      "What is hypothesis testing, and how do you interpret a p-value in a business analytics context?",
      "How do you determine the correct data visualization type (e.g. bar chart, scatter plot, box plot) for different audiences?",
      "Explain data normalization vs. denormalization and their impacts on query latency.",
      "How do you handle missing or anomalous data in a large dataset before drawing statistical inferences?"
    ];
  } else if (role.includes('devops') || role.includes('site reliability') || role.includes('sre')) {
    techQuestions = [
      "Explain the principles of Infrastructure as Code (IaC) and how tools like Terraform manage state.",
      "What is the difference between Blue-Green deployment and Canary deployment strategies?",
      "How do you design a high-availability CI/CD pipeline that automatically rolls back on test failures?",
      "What are Kubernetes Pods, Deployments, and Services, and how do they route traffic?",
      "Describe how you would set up monitoring and alerting dashboards using Prometheus and Grafana."
    ];
  } else if (role.includes('cloud') || role.includes('aws') || role.includes('azure') || role.includes('gcp')) {
    techQuestions = [
      "What are the core cloud design patterns for achieving high availability, disaster recovery, and fault tolerance?",
      "Explain the differences between Cloud Virtual Machines (e.g. AWS EC2), Containers (ECS), and Serverless (Lambda).",
      "How do you secure cloud networks using VPCs, security groups, and private subnets?",
      "What is the cloud shared responsibility model, and how do you manage IAM policies securely?",
      "How do you optimize cloud resource costs for a system with highly variable load profiles?"
    ];
  } else if (role.includes('mobile') || role.includes('ios') || role.includes('android') || role.includes('flutter') || role.includes('cordova')) {
    techQuestions = [
      "Explain the differences between native mobile development (Swift/Kotlin) and cross-platform frameworks (React Native/Flutter).",
      "How does the mobile app lifecycle work, and how do you manage memory and state during app suspension?",
      "Describe your strategy for local database caching (e.g. Room, CoreData, SQLite) to enable offline mode.",
      "How do you optimize mobile application energy usage, battery consumption, and image rendering performance?",
      "Explain how push notification tokens are managed and registered between the device, APNS/FCM, and backend."
    ];
  } else if (role.includes('qa') || role.includes('test') || role.includes('quality') || role.includes('automation')) {
    techQuestions = [
      "What is the difference between unit testing, integration testing, and end-to-end (E2E) testing?",
      "How do you design test cases for a login form, including boundary value analysis and equivalence partitioning?",
      "Explain how automated testing tools (like Selenium or Cypress) locate page elements dynamically and handle waits.",
      "What is the role of regression testing, and how do you select which test cases to run in a release cycle?",
      "How do you perform API testing (e.g. checking response status, payload formats, and header tokens) using automated scripts?"
    ];
  } else if (role.includes('product') || role.includes('pm') || role.includes('management')) {
    techQuestions = [
      "How do you prioritize a product backlog containing technical debt, bug fixes, and new features?",
      "Describe the structure of a Product Requirement Document (PRD) and how you communicate requirements to engineering.",
      "How do you define, track, and analyze key performance metrics (KPIs) like retention, conversion, and churn?",
      "Explain how you would design an A/B test to validate a new user onboarding flow.",
      "How do you manage stakeholders with conflicting feature requests and align them on the product roadmap?"
    ];
  } else {
    techQuestions = [
      "Explain how JavaScript handles asynchronous operations using the event loop.",
      "What are the key advantages of using a NoSQL database over a relational database, and when would you choose one?",
      "Explain the difference between monolith and microservices architecture.",
      "How do you handle API versioning and ensure backward compatibility for production services?",
      "Describe your preferred branching strategy (e.g. GitFlow) and release management process."
    ];
  }

  let projectQuestions = [];
  if (projects.length > 0) {
    const projName1 = projects[0];
    const projName2 = projects[1] || 'your other project';
    projectQuestions = [
      `In your ${projName1} project, why did you select the specific database and tech stack used?`,
      `How is authentication and user authorization implemented in ${projName1}?`,
      `What was the most difficult technical challenge you encountered while building ${projName1}, and how did you resolve it?`,
      projects[1]
        ? `How did you structure the API design or database schema in your ${projName2} project?`
        : `Describe the core architectural design pattern you chose to organize the code in ${projName1}.`,
      `If you had to scale ${projName1} to handle 10,000 concurrent users, what architectural bottlenecks would you address first?`
    ];
  } else {
    // Generate role-specific hypothetical project questions
    if (role.includes('front') || role.includes('react') || role.includes('ui/ux') || role.includes('designer') || role.includes('design')) {
      if (role.includes('designer') || role.includes('ux') || role.includes('design')) {
        projectQuestions = [
          "Describe the layout and user flow of a recent design project you completed. What UX challenges did you solve?",
          "How do you approach designing a custom interactive prototype for a complex multi-step user task?",
          "Explain how you design responsive UI components in Figma that adapt smoothly to mobile, tablet, and desktop views.",
          "Describe a project where you defined color, typography, and spacing tokens for a cohesive design system.",
          "How do you conduct usability tests on your mockups and incorporate feedback into subsequent iterations?"
        ];
      } else {
        projectQuestions = [
          "Describe the component architecture and folder structure of a complex single-page application you have built.",
          "How do you handle global state management (e.g. Redux, Zustand) and API data caching in your web applications?",
          "Describe a project where you optimized client-side rendering performance, bundle sizes, or asset loading times.",
          "How do you approach styling (e.g. Tailwind, CSS modules) to build accessible and responsive component layouts?",
          "What is your approach to writing automated unit and integration tests (e.g. Jest, Cypress) for your UI components?"
        ];
      }
    } else if (role.includes('back') || role.includes('node') || role.includes('server') || role.includes('api') || role.includes('backend')) {
      projectQuestions = [
        "Describe a backend service or API you built. What database schema and architectural patterns did you select and why?",
        "How do you implement secure user authentication, role-based access control, and session validation in your APIs?",
        "Describe a project where you identified and resolved a slow database query, lock issue, or indexing bottleneck.",
        "How do you handle error logging, request validation, and API versioning in a production backend service?",
        "If you had to design a system to process millions of background tasks daily, what queue and worker architecture would you use?"
      ];
    } else if (role.includes('full stack') || role.includes('fullstack')) {
      projectQuestions = [
        "Describe a full-stack web application you designed. How did you structure client-server communication and database synchronization?",
        "What security best practices do you follow to protect your database and client interfaces from SQL injection and XSS attacks?",
        "How do you structure database schemas and configure caching layers (e.g., Redis) to handle high-traffic operations?",
        "Describe your local development and production deployment workflow, including containerization and CI/CD pipelines.",
        "How do you manage client-side state transitions when dealing with network latency or offline synchronization?"
      ];
    } else if (role.includes('cyber') || role.includes('security') || role.includes('pentest')) {
      projectQuestions = [
        "Describe a vulnerability assessment or network security project you conducted. What weaknesses did you find and mitigate?",
        "How do you set up firewalls, secure network subnets, and configure IAM policies to protect cloud infrastructure?",
        "Describe how you perform security audits, static code analysis, and dependency checks in a development pipeline.",
        "What steps do you take when responding to a security incident or analyzing suspicious log patterns?",
        "Explain how you implement end-to-end encryption, secure key storage, and token authentication in application architectures."
      ];
    } else if (role.includes('devops') || role.includes('site reliability') || role.includes('sre') || role.includes('cloud') || role.includes('aws') || role.includes('azure') || role.includes('gcp')) {
      projectQuestions = [
        "Describe an Infrastructure as Code (IaC) project where you managed cloud resources using Terraform, Ansible, or CloudFormation.",
        "How do you design highly available, fault-tolerant, and secure cloud environments on AWS/Azure/GCP?",
        "Describe a CI/CD pipeline you configured from scratch. How did you automate testing, containerization, and rollbacks?",
        "What monitoring, logging, and alerting systems (e.g., Prometheus, Grafana, ELK) have you set up for microservices?",
        "Explain how you managed a migration or designed a container scaling policy to handle sudden traffic spikes."
      ];
    } else if (role.includes('ai') || role.includes('machine') || role.includes('learn') || role.includes('ml') || role.includes('deep learning') || role.includes('data scientist')) {
      projectQuestions = [
        "Describe an end-to-end machine learning project you worked on. What were the data preparation, modeling, and evaluation phases?",
        "How do you handle feature engineering and manage missing, anomalous, or imbalanced data during training?",
        "What evaluation metrics did you use to validate your model's performance, and how did you prevent overfitting?",
        "How do you design and deploy ML inference pipelines to production (e.g. using Triton, FastAPI, or cloud endpoints)?",
        "Describe a project where you implemented deep learning or natural language processing, and explain your model selection process."
      ];
    } else if (role.includes('data analyst') || role.includes('analyst') || role.includes('sql')) {
      projectQuestions = [
        "Describe a data analysis project where you extracted actionable business insights from a large, unstructured dataset.",
        "Explain how you structure complex SQL queries, window functions, and database joins to prepare data for reporting.",
        "How do you design interactive BI dashboards (e.g., in Tableau or PowerBI) to communicate insights to non-technical stakeholders?",
        "Describe a time when you had to perform statistical hypothesis testing or A/B testing on product/user data.",
        "What strategies do you use to clean, normalize, and validate data quality before publishing reports?"
      ];
    } else if (role.includes('qa') || role.includes('test') || role.includes('quality') || role.includes('automation')) {
      projectQuestions = [
        "Describe an automated testing framework you built or maintained. What tools (e.g., Selenium, Playwright, Jest) did you use?",
        "How do you structure Page Object Model (POM) and manage test data for stable, parallel E2E test execution?",
        "Explain your strategy for test coverage analysis, and how you decide what to automate vs. test manually.",
        "How do you integrate automated tests into a CI/CD pipeline and report test failures to the team?",
        "Describe a challenging bug you found and how you analyzed API logs or database state to identify its root cause."
      ];
    } else if (role.includes('product') || role.includes('pm') || role.includes('management')) {
      projectQuestions = [
        "Describe a product feature launch you managed from conceptualization to release. How did you define success?",
        "How do you write comprehensive user stories, set acceptance criteria, and align technical teams on requirements?",
        "Describe a time when you had to make a tough trade-off between technical debt and shipping a feature on time.",
        "How do you gather user feedback, analyze product usage metrics, and feed those insights back into the roadmap?",
        "Describe how you manage conflicting stakeholder demands and align the product vision across engineering, marketing, and sales."
      ];
    } else {
      projectQuestions = [
        "Describe the architecture and database schema of a software project you built. What trade-offs did you make?",
        "How do you structure code and modules in your projects to ensure maintainability, readability, and ease of testing?",
        "What tools and methodologies (e.g., Git, Docker, CI/CD) do you use to streamline your local development workflow?",
        "Describe a performance issue or technical blocker you encountered in a project and how you debugged it.",
        "How do you approach learning new technologies and applying them to solve problems in your projects?"
      ];
    }
  }

  const gaps = missingSkills.length > 0 ? missingSkills : ['Docker', 'CI/CD Pipelines', 'Kubernetes'];
  const gapQuestions = [
    `Explain the difference between a virtual machine and a container like ${gaps[0] || 'Docker'}.`,
    `How would you design a robust ${gaps[1] || 'CI/CD'} pipeline from code commit to cloud deployment?`,
    `What are the advantages of container orchestration tools like ${gaps[2] || 'Kubernetes'} in microservice architectures?`,
    `How do you manage configuration secrets and environment-specific parameters in a containerized environment?`,
    `Explain how you would monitor and debug container failures in production.`
  ];

  const behavioral = [
    "Describe a time when you had to work with a teammate who had a very different technical perspective. How did you resolve the conflict?",
    "Tell me about a project that did not meet expectations or failed. What did you learn from the experience?",
    "How do you prioritize your learning when you need to quickly pick up a brand new language or framework for a project?",
    "Describe a situation where you had a tight deadline but had to compromise on technical debt. How did you handle it?",
    "How do you handle constructive criticism on your code during peer review or pull request discussions?"
  ];

  const hrQuestions = [
    "Why do you want to join our team as an engineer?",
    "Where do you see yourself technically in the next three to five years?",
    "What do you think is the most challenging part of remote software development collaboration?",
    "What are your expectations regarding professional development and mentorship in this role?",
    "Why are you looking to make a transition from your current position or project at this time?"
  ];

  const gradingRubric = [
    { category: "Technical questions", criteria: "Shows depth of understanding, mentions design patterns, and highlights scaling considerations.", excellentScoreGuidelines: "Mentions specific language or runtime paradigms verbatim, demonstrating deep production experience." },
    { category: "Project-based questions", criteria: "Explains architecture patterns, trade-offs, and scaling bottlenecks.", excellentScoreGuidelines: "Provides concrete metrics (e.g. latency, throughput improvements) and detailed design diagrams." },
    { category: "Domain Knowledge Benchmarks", criteria: "Demonstrates eagerness to learn and general conceptual familiarity.", excellentScoreGuidelines: "Draws analogies to existing skills and maps out a clear learning path for the new tool." },
    { category: "Behavioral questions", criteria: "Displays emotional intelligence, ownership mindset, and collaborative communication.", excellentScoreGuidelines: "Uses the STAR method (Situation, Task, Action, Result) with clear team outcomes." },
    { category: "HR questions", criteria: "Communicates career goals and alignment with company culture.", excellentScoreGuidelines: "Aligns personal growth with company mission, demonstrating longevity and passion." }
  ];

  return {
    technical: techQuestions,
    projectBased: projectQuestions,
    skillGap: gapQuestions,
    domainKnowledge: gapQuestions,
    behavioral: behavioral,
    hrQuestions: hrQuestions,
    gradingRubric: gradingRubric
  };
};

/**
 * Executes a fetch request and parses JSON response within a strict AbortController timeout.
 * @param {string} url
 * @param {object} options
 * @param {number} timeoutMs
 * @returns {Promise<object>} - Parsed JSON response.
 */
const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = OPENROUTER.REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    if (!response.ok) {
      const status = response.status;
      let detailMessage = '';
      try {
        const body = await response.text();
        detailMessage = body ? ` - ${body}` : '';
      } catch (err) {}
      
      if (status === 402) {
        throw new Error(`OpenRouter Credit Insufficient (402)${detailMessage}`);
      } else if (status === 429) {
        throw new Error(`OpenRouter Rate Limit Exceeded (429)${detailMessage}`);
      } else if (status === 503) {
        throw new Error(`OpenRouter Model Overloaded or Down (503)${detailMessage}`);
      } else {
        throw new Error(`OpenRouter API responded with status ${status}${detailMessage}`);
      }
    }
    
    const data = await response.json();
    return data;
  } finally {
    clearTimeout(id);
  }
};

const crypto = require('crypto');

const isTransientError = (err) => {
  const msg = err.message || '';
  // HTTP status checks: 429, 500, 502, 503, 504
  if (msg.includes('status 429') || msg.includes('(429)') || msg.includes('429')) return true;
  if (msg.includes('status 500') || msg.includes('(500)')) return true;
  if (msg.includes('status 502') || msg.includes('(502)')) return true;
  if (msg.includes('status 503') || msg.includes('(503)')) return true;
  if (msg.includes('status 504') || msg.includes('(504)')) return true;
  
  // Network timeouts
  if (err.name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout') || msg.includes('timed out')) {
    return true;
  }
  
  // Connection resets/network failures
  if (msg.includes('fetch failed') || msg.includes('connection') || msg.includes('network') || msg.includes('socket')) {
    return true;
  }
  
  return false;
};

const extractHttpStatus = (error) => {
  const match = error.message.match(/status (\d+)/i) || error.message.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Unified helper to execute an AI API request with up to automatic retries and model cycling failovers.
 * Returns parsed JSON object if successful, or throws a user-friendly error on final failure.
 */
const executeWithRetry = async (requestId, modelName, fetchFunc, validatorFunc) => {
  let attempt = 0;
  let modelIndex = OPENROUTER_MODELS.indexOf(modelName);
  if (modelIndex === -1) modelIndex = 0;

  const maxAttempts = Math.max(3, OPENROUTER_MODELS.length);
  
  while (attempt < maxAttempts) {
    const currentModel = OPENROUTER_MODELS[(modelIndex + attempt) % OPENROUTER_MODELS.length] || 'openrouter/free';
    const runStartTime = Date.now();
    try {
      const resultString = await fetchFunc(currentModel);
      
      if (!resultString || resultString.trim().length === 0) {
        throw new Error('Received empty response from AI provider.');
      }
      
      const parsed = JSON.parse(cleanJsonString(resultString));
      
      if (!validatorFunc(parsed)) {
        const schemaErr = new Error('AI response failed schema, required fields, or type validation.');
        schemaErr.isSchemaFailure = true;
        throw schemaErr;
      }
      
      const duration = Date.now() - runStartTime;
      logger.info('AIAnalyzer', `[Req ID: ${requestId}] ✅ Success. Model: ${currentModel}, Duration: ${duration}ms, Attempt: ${attempt + 1}/${maxAttempts}, Final result: Success.`);
      return parsed;
      
    } catch (err) {
      const duration = Date.now() - runStartTime;
      const status = extractHttpStatus(err);
      
      logger.error('AIAnalyzer', `[Req ID: ${requestId}] ❌ Attempt ${attempt + 1}/${maxAttempts} failed. Model: ${currentModel}, Duration: ${duration}ms, HTTP status: ${status || 'N/A'}, Failure reason: ${err.message}`);
      
      attempt++;
      if (attempt < maxAttempts && !err.isSchemaFailure && !(err instanceof SyntaxError) && isTransientError(err)) {
        const nextModel = OPENROUTER_MODELS[(modelIndex + attempt) % OPENROUTER_MODELS.length] || 'openrouter/free';
        const delay = attempt === 1 ? 1000 : 2000;
        logger.info('AIAnalyzer', `[Req ID: ${requestId}] 🕒 Retrying with model ${nextModel} (Attempt ${attempt + 1}/${maxAttempts}) in ${delay}ms due to transient error...`);
        await sleep(delay);
      } else {
        logger.error('AIAnalyzer', `[Req ID: ${requestId}] 🛑 Request pipeline terminated. Final result: Failure.`);
        const finalErr = new Error("Analysis could not be generated. Please try again.");
        finalErr.code = 'AI_ANALYSIS_FAILED';
        finalErr.originalError = err;
        throw finalErr;
      }
    }
  }
};

const analyzeResumeText = async (text, targetRole, atsAnalysisContext) => {
  const t_prompt_start = Date.now();
  if (!apiKey) {
    logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY is not configured. Returning mock analysis.');
    return getMockRoleBasedAts(targetRole);
  }

  const systemPrompt = `You are an expert ATS recruiter. Analyze the candidate's resume ONLY for the targetRole.
Follow these strict rules:
1. STRICT TRUTH & GROUNDING: Analyze only the provided resume text. Do not invent experience or skills. Identify at most 3 strengths. For each strength, you MUST provide a "source_evidence" field containing a VERBATIM substring copied exactly from the resume that justifies it.
2. CONCISE SUMMARY ARRAYS: Identify at most 3 weaknesses, at most 5 missingKeywords, and at most 3 recommendations.
3. NO OVERLAPS: Do not list any technical skills, keywords, or tools identified as missing in the missingKeywords array inside the strengths, weaknesses, or recommendations arrays. Focus weaknesses and recommendations on qualitative/structural concepts (e.g. lack of quantified achievements, missing portfolio link, summary length).
4. CONCISE CATEGORY EXPLANATIONS: For each category in the "categoryExplanations" schema below, write a concise explanation (at most 1 sentence, max 15 words) justifying the score passed in the input under "calculatedBreakdownScores".
5. FORMAT: Return ONLY a valid JSON object. Do not include markdown code block formatting (like \`\`\`json), preambles, or postscripts.

The JSON response must conform exactly to this schema:
{
  "strengths": [
    {
      "text": "string (the description of the strength, max 3 items)",
      "source_evidence": "string (verbatim substring from the resume)"
    }
  ],
  "weaknesses": string[] (max 3 items),
  "missingKeywords": string[] (max 5 items),
  "recommendations": string[] (max 3 items),
  "roleFit": string,
  "categoryExplanations": {
    "contact": "string (explanation for the contact score, max 15 words)",
    "formatting": "string (explanation for the formatting score, max 15 words)",
    "skills": "string (explanation for the skills score, max 15 words)",
    "experience": "string (explanation for the experience score, max 15 words)",
    "projects": "string (explanation for the projects score, max 15 words)",
    "education": "string (explanation for the education score, max 15 words)",
    "keywords": "string (explanation for the keywords score, max 15 words)",
    "achievements": "string (explanation for the achievements score, max 15 words)"
  }
}`;
  const t_prompt_finish = Date.now();

  const t_serialization_start = Date.now();
  const jsonInput = {
    targetRole: targetRole || 'Software Engineer',
    resumeText: text,
    detectedSkills: (atsAnalysisContext && atsAnalysisContext.detectedSkills) || [],
    calculatedBreakdownScores: (atsAnalysisContext && atsAnalysisContext.breakdown) || {}
  };
  
  const payloadBase = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(jsonInput) }
    ],
    max_tokens: OPENROUTER.MAX_TOKENS,
    temperature: OPENROUTER.TEMPERATURE,
    top_p: OPENROUTER.TOP_P,
    frequency_penalty: OPENROUTER.FREQUENCY_PENALTY,
    presence_penalty: OPENROUTER.PRESENCE_PENALTY
  };
  const bodyBaseStr = JSON.stringify(payloadBase);
  const t_serialization_finish = Date.now();

  const t_dispatch_start = Date.now();
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': env.CLIENT_URL,
    'X-Title': 'Resumetrices'
  };
  const t_dispatch_finish = Date.now();

  const requestId = `res_${crypto.randomUUID()}`;

  const fetchFunc = async (model) => {
    const payloadObject = JSON.parse(bodyBaseStr);
    payloadObject.model = model;
    const finalBodyStr = JSON.stringify(payloadObject);

    // Calculate prompt size metrics
    const charactersCount = systemPrompt.length + JSON.stringify(jsonInput).length;
    const estimatedTokens = Math.ceil(charactersCount / 4);
    const payloadKB = Math.ceil(Buffer.byteLength(finalBodyStr, 'utf8') / 1024);

    // Log request size metrics EXACTLY as requested
    logger.info('AIAnalyzer', `Request Size Metrics for ${model}:\n` +
      `Characters:\n${charactersCount.toLocaleString()}\n\n` +
      `Estimated Tokens:\n${estimatedTokens.toLocaleString()}\n\n` +
      `JSON Payload:\n${payloadKB} KB`
    );

    const fetch_start_time = Date.now();
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), OPENROUTER.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENROUTER.URL, {
        method: 'POST',
        headers: headers,
        body: finalBodyStr,
        signal: controller.signal
      });

      const fetch_headers_time = Date.now();

      if (!response.ok) {
        const status = response.status;
        let detailMessage = '';
        try {
          const body = await response.text();
          detailMessage = body ? ` - ${body}` : '';
        } catch (err) {}
        throw new Error(`OpenRouter API responded with status ${status}${detailMessage}`);
      }

      const payload = await response.json();
      const fetch_body_time = Date.now();

      if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
        throw new Error('Malformed completion response structure received from OpenRouter API.');
      }

      const t_final = Date.now();
      const promptBuildDuration = t_prompt_finish - t_prompt_start;
      const serializationDuration = t_serialization_finish - t_serialization_start;
      const httpDispatchDuration = t_dispatch_finish - t_dispatch_start;
      const waitingForAIDuration = fetch_headers_time - fetch_start_time;
      const responseParsingDuration = (fetch_body_time - fetch_headers_time) + (t_final - fetch_body_time);
      const totalDuration = t_final - t_prompt_start;

      // Print request lifecycle timings EXACTLY in requested format
      logger.info('AIAnalyzer', `Request Lifecycle Timings for ${model}:\n` +
        `Prompt Build:\n${promptBuildDuration} ms\n\n` +
        `Serialization:\n${serializationDuration} ms\n\n` +
        `HTTP Dispatch:\n${httpDispatchDuration} ms\n\n` +
        `Waiting for AI:\n${waitingForAIDuration} ms\n\n` +
        `Response Parsing:\n${responseParsingDuration} ms\n\n` +
        `Total:\n${totalDuration} ms`
      );

      if (payload.usage) {
        logger.info('AIAnalyzer', `${model} completion usage metrics:`, {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens
        });
      }

      return payload.choices[0].message.content;
    } finally {
      clearTimeout(id);
    }
  };

  const validatorFunc = (parsed) => {
    if (!aiResponseValidator.validateAtsAnalysis(parsed)) return false;
    const validation = groundingValidator.validateAtsAnalysis(parsed, text, targetRole);
    Object.assign(parsed, validation.validated);
    return true;
  };

  try {
    return await executeWithRetry(requestId, OPENROUTER.MODEL_ID, fetchFunc, validatorFunc);
  } catch (error) {
    logger.warn('AIAnalyzer', `⚠️ API execution failed. Falling back to high-fidelity mock data for role "${targetRole}" to prevent pipeline crash. Error: ${error.message}`);
    return getMockRoleBasedAts(targetRole);
  }
};

/**
 * Validates the parsed JSON object to ensure it contains all required skill gap analysis fields.
 */
const validateSkillGapResult = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  if (typeof obj.matchedSkills === 'string') obj.matchedSkills = [obj.matchedSkills];
  if (typeof obj.missingSkills === 'string') obj.missingSkills = [obj.missingSkills];
  if (typeof obj.recommendedSkills === 'string') obj.recommendedSkills = [obj.recommendedSkills];
  if (typeof obj.learningRoadmap === 'string') obj.learningRoadmap = [obj.learningRoadmap];

  const requiredKeys = ['matchedSkills', 'missingSkills', 'recommendedSkills', 'learningRoadmap'];
  return requiredKeys.every(key => Array.isArray(obj[key]));
};

/**
 * Performs a skill gap analysis for a candidate's resume text against a target industry role.
 */
const analyzeSkillGap = async (resumeText, targetRole, detectedSkills = []) => {
  const role = targetRole || 'Software Engineer';

  if (!apiKey) {
    logger.warn('AIAnalyzer', `⚠️ OPENROUTER_API_KEY is not configured. Returning mock skill gap results for "${role}".`);
    return getMockSkillGap(role, resumeText, detectedSkills);
  }

  const systemPrompt = `You are an expert technical recruiter and talent assessor.

Compare the candidate's resume skills against standard industry expectations for the target role: "${role}".

You must follow these strict rules:
1. Analyze ONLY the provided resume text. Do NOT assume, invent, or hallucinate any skills, experience, or projects.
2. EVERY MATCHED SKILL MUST BE GROUNDED: For each matched skill, you must provide a "source_evidence" field containing a VERBATIM substring copied exactly from the resume text that justifies it. If no such substring exists, do not list it as a matched skill.
3. MISSING & RECOMMENDED SKILLS: Identify missing skills and recommended skills based strictly on standard expectations for "${role}" compared to the candidate's actual content. These are gap-inference fields, so they do not require source evidence.

You must return ONLY a valid JSON object containing these exact keys:
- "matchedSkills": [
    {
      "name": "string (the name of the matched skill)",
      "source_evidence": "string (verbatim substring from the resume)"
    }
  ]
- "missingSkills": array of strings
- "recommendedSkills": array of strings
- "learningRoadmap": [
    {
      "title": "string (the milestone name/focus)",
      "duration": "string (e.g. 2 weeks)",
      "topics": ["string (at most 3 key topics/skills to study)"]
    }
  ]

Do not include any preamble, introduction, markdown code block backticks (like \`\`\`json), or trailing notes. The response must start with { and end with }`;

  const userContent = `Target Role: ${role}\n` +
    (detectedSkills && detectedSkills.length > 0 ? `Detected technical skills from candidate's resume: ${detectedSkills.join(', ')}\n` : '') +
    `\nResume Text:\n\n${resumeText}`;

  const requestId = `sg_${crypto.randomUUID()}`;

  const fetchFunc = async (model) => {
    const payload = await fetchJsonWithTimeout(OPENROUTER.URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.CLIENT_URL,
        'X-Title': 'Resumetrices'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: OPENROUTER.MAX_TOKENS,
        temperature: OPENROUTER.TEMPERATURE,
        top_p: OPENROUTER.TOP_P,
        frequency_penalty: OPENROUTER.FREQUENCY_PENALTY,
        presence_penalty: OPENROUTER.PRESENCE_PENALTY
      })
    });
    
    if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
      throw new Error('Malformed completion response structure received from OpenRouter API.');
    }
    
    if (payload.usage) {
      logger.info('AIAnalyzer', `${model} completion usage metrics (Skill Gap):`, {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens
      });
    }
    
    return payload.choices[0].message.content;
  };

  const validatorFunc = (parsed) => {
    if (!aiResponseValidator.validateSkillGap(parsed)) return false;
    const validation = groundingValidator.validateSkillGap(parsed, resumeText, targetRole);
    Object.assign(parsed, validation.validated);
    return true;
  };

  try {
    return await executeWithRetry(requestId, OPENROUTER.MODEL_ID, fetchFunc, validatorFunc);
  } catch (error) {
    logger.warn('AIAnalyzer', `⚠️ Skill gap API execution failed. Falling back to high-fidelity mock data for role "${role}" to prevent pipeline crash. Error: ${error.message}`);
    return getMockSkillGap(role, resumeText, detectedSkills);
  }
};

/**
 * Validates the parsed JSON object to ensure it contains all required interview questions fields.
 */
const validateInterviewQuestionsResult = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  if (typeof obj.technical === 'string') obj.technical = [obj.technical];
  if (typeof obj.projectBased === 'string') obj.projectBased = [obj.projectBased];
  if (typeof obj.skillGap === 'string') obj.skillGap = [obj.skillGap];
  if (typeof obj.behavioral === 'string') obj.behavioral = [obj.behavioral];
  if (typeof obj.hrQuestions === 'string') obj.hrQuestions = [obj.hrQuestions];

  const requiredKeys = ['technical', 'projectBased', 'skillGap', 'behavioral', 'hrQuestions'];
  return requiredKeys.every(key => Array.isArray(obj[key]));
};

/**
 * Generates customized technical, project-specific, behavioral, and HR interview questions based on resume content.
 */
const generateInterviewQuestions = async (resumeText, atsAnalysis = null, detectedSkills = [], targetRole = 'Software Engineer', missingSkills = [], candidateProfile = null, difficultyMetadata = null) => {
  if (!apiKey) {
    logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY is not configured. Returning mock interview questions.');
    return getMockInterviewQuestions(targetRole, detectedSkills, missingSkills, resumeText);
  }

  const isStandalone = !resumeText || resumeText === "Standalone Mode";
  const requestId = `iq_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  
  const systemPrompt = isStandalone
    ? `You are an expert technical interviewer and talent evaluator.
Generate exactly 25 customized interview questions (exactly 5 in each of the 5 categories) purely tailored to the target role: "${targetRole || 'Software Engineer'}" based strictly on its industry standards.
Adapt the technical depth, projects, and contextual scenarios to match standard expectations and difficulties for a professional in this specific role.

To ensure deep variance and prevent duplication across multiple requests, you must explore different angles of the core competencies (e.g., swapping specific system design scenarios, varying architectural trade-offs, or rotating problem-solving behavioral prompts).

You must follow these strict rules:
1. technical: exactly 5 questions focusing on core technologies, concepts, and systems expected for the target role. The "source_evidence" field should contain the key technology name or standard.
2. projectBased: exactly 5 questions focusing on common project architectures, design choices, database designs, or builds expected for this role. The "source_evidence" field should contain a standard project concept.
3. domainKnowledge: exactly 5 questions focusing on core domain knowledge and technical benchmarks expected for this role. The "source_evidence" field should contain the key competency or standard name.
4. behavioral: exactly 5 behavioral questions tailored to this role's collaboration/delivery environment. Grounding not required.
5. hrQuestions: exactly 5 HR/career path questions tailored to this role. Grounding not required.

You must also include a grading rubric containing general evaluation benchmarks/rubrics for grading the candidate answers in each category.

You must return ONLY a valid JSON object containing these exact keys:
- "technical": array of objects { question: string, source_evidence: string }
- "projectBased": array of objects { question: string, source_evidence: string }
- "domainKnowledge": array of objects { question: string, source_evidence: string }
- "behavioral": array of strings (the questions)
- "hrQuestions": array of strings (the questions)
- "gradingRubric": array of objects { category: string, criteria: string, excellentScoreGuidelines: string } (generate exactly 5 objects matching the 5 categories of questions above)

Do not include any preamble, introduction, markdown code block backticks (like \`\`\`json), or trailing notes. The response must start with { and end with }`
    : `You are an expert technical interviewer and talent evaluator.

Analyze the candidate's resume content, specifically focusing on their skills, projects, education, and work experience, along with their target role and detected skill gaps.

Generate exactly 25 customized interview questions (exactly 5 in each of the 5 categories). 

To ensure deep variance and prevent duplication across multiple requests, you must explore different angles of the core competencies (e.g., swapping specific system design scenarios, varying architectural trade-offs, or rotating problem-solving behavioral prompts).

You must follow these strict rules:
1. technical: exactly 5 questions focusing on technologies mentioned in the candidate's resume, each containing a verbatim "source_evidence" substring from the resume justifying the skill.
2. projectBased: exactly 5 questions focusing on projects listed in the candidate's resume, each containing a verbatim "source_evidence" substring.
3. domainKnowledge: exactly 5 questions targeting missing keywords or core technical competencies expected for this target role, each containing a verbatim "source_evidence" substring showing the missing skill or competency context from the resume.
4. behavioral: exactly 5 behavioral questions tailored to the candidate's experience. Grounding not required.
5. hrQuestions: exactly 5 HR/career questions tailored to their path. Grounding not required.

You must also include a grading rubric containing general evaluation benchmarks/rubrics for grading the candidate answers in each category.

You must return ONLY a valid JSON object containing these exact keys:
- "technical": array of objects { question: string, source_evidence: string }
- "projectBased": array of objects { question: string, source_evidence: string }
- "domainKnowledge": array of objects { question: string, source_evidence: string }
- "behavioral": array of strings (the questions)
- "hrQuestions": array of strings (the questions)
- "gradingRubric": array of objects { category: string, criteria: string, excellentScoreGuidelines: string } (generate exactly 5 objects matching the 5 categories of questions above)

Do not include any preamble, introduction, markdown code block backticks (like \`\`\`json), or trailing notes. The response must start with { and end with }`;

  const userContent = `Target Role: ${targetRole || 'Software Engineer'}\n` +
    `Entropy/Seed Token: ${requestId}_${timestamp}\n` +
    `Directive: You must generate a highly unique and varied set of questions that explore fresh architectural scenarios, specific tool configurations, and varied behavioral situations for this role. Do not repeat common templates.\n` +
    (detectedSkills && detectedSkills.length > 0 ? `Detected technical skills from candidate's resume: ${detectedSkills.join(', ')}\n` : '') +
    (missingSkills && missingSkills.length > 0 ? `Identified missing skills/gaps: ${missingSkills.join(', ')}\n` : '') +
    (candidateProfile ? `Candidate Profile Metrics: Experience=${candidateProfile.experienceLevel}, Depth=${candidateProfile.technicalDepth}, Complexity=${candidateProfile.projectComplexity}, ATS Score=${candidateProfile.atsScore}\n` : '') +
    (difficultyMetadata ? `Adaptive Interview Guidelines: Classification=${difficultyMetadata.difficultyClassification}, Suggested Question Difficulty=${difficultyMetadata.questionDifficulty}, Depth Focus=${difficultyMetadata.focusArea}\n` : '') +
    `\nResume Text:\n\n${resumeText}`;

  const fetchFunc = async (model) => {
    const payload = await fetchJsonWithTimeout(OPENROUTER.URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.CLIENT_URL,
        'X-Title': 'Resumetrices'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 1200, // Override global limit to prevent 25 questions truncation
        temperature: OPENROUTER.TEMPERATURE,
        top_p: OPENROUTER.TOP_P,
        frequency_penalty: OPENROUTER.FREQUENCY_PENALTY,
        presence_penalty: OPENROUTER.PRESENCE_PENALTY
      })
    });
    
    if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
      throw new Error('Malformed completion response structure received from OpenRouter API.');
    }
    
    if (payload.usage) {
      logger.info('AIAnalyzer', `${model} completion usage metrics (Interview Questions):`, {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens
      });
    }
    
    return payload.choices[0].message.content;
  };

  const validatorFunc = (parsed) => {
    if (!aiResponseValidator.validateInterviewQuestions(parsed)) return false;
    const validation = groundingValidator.validateInterviewQuestions(parsed, resumeText, targetRole);
    Object.assign(parsed, validation.validated);
    return true;
  };

  try {
    return await executeWithRetry(requestId, OPENROUTER.MODEL_ID, fetchFunc, validatorFunc);
  } catch (error) {
    logger.warn('AIAnalyzer', `⚠️ Interview questions API execution failed. Falling back to high-fidelity mock data for role "${targetRole}" to prevent pipeline crash. Error: ${error.message}`);
    return getMockInterviewQuestions(targetRole, detectedSkills, missingSkills, resumeText);
  }
};

/**
 * Classifies the document text to detect its type (e.g., Resume, CV, Academic Result, DGS, Invoice, Unknown).
 * @param {string} text - The extracted text of the document.
 * @param {number} maxRetries - Maximum number of API retries.
 * @returns {Promise<string>} - One of the allowed document types.
 */
const classifyDocument = async (text, maxRetries = OPENROUTER_MODELS.length - 1) => {
  const snippet = (text || '').substring(0, 1500);
  
  // Heuristic classifier as a fallback or if apiKey is missing
  const runHeuristicClassification = (t) => {
    const lower = t.toLowerCase();
    
    // Check for Resume/CV indicators first
    if (
      lower.includes('experience') || 
      lower.includes('education') || 
      lower.includes('skills') || 
      lower.includes('projects') || 
      lower.includes('work history') || 
      lower.includes('employment') || 
      lower.includes('curriculum vitae') || 
      lower.includes('professional summary') || 
      lower.includes('summary of qualifications')
    ) {
      return 'Resume';
    }
    
    if (
      lower.includes('invoice') || 
      lower.includes('bill to') || 
      lower.includes('purchase order') || 
      lower.includes('amount due')
    ) {
      return 'Invoice';
    }
    
    if (
      lower.includes('transcript of record') || 
      lower.includes('marksheet') || 
      lower.includes('grade card') || 
      lower.includes('semester report') || 
      lower.includes('academic transcript') || 
      lower.includes('academic result')
    ) {
      return 'Academic Result';
    }
    
    if (
      lower.includes('dgs') || 
      lower.includes('directorate general')
    ) {
      return 'DGS';
    }
    
    return 'Unknown';
  };

  if (!apiKey) {
    logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY not configured for classification. Using heuristics.');
    return runHeuristicClassification(snippet);
  }

  const systemPrompt = `You are a document classifier.
Analyze the document text snippet and classify it into exactly one of these categories:
- Resume
- CV
- Academic Result
- DGS
- Invoice
- Unknown

Your response must contain ONLY the category name. Do not include explanation, markdown code blocks, or punctuation. If the document is a curriculum vitae, return "CV". If it is a resume, return "Resume". If it is an academic transcript/grade sheet/result, return "Academic Result". If it is a DGS document, return "DGS". If it is an invoice/bill, return "Invoice". Otherwise, return "Unknown".`;

  let attempt = 0;
  while (attempt <= maxRetries) {
    const currentModel = OPENROUTER_MODELS[attempt] || 'openrouter/free';
    try {
      logger.info('AIAnalyzer', `🤖 Requesting document classification using ${currentModel}...`);
      
      const payload = await fetchJsonWithTimeout(OPENROUTER.URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.CLIENT_URL,
          'X-Title': 'Resumetrices'
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Document snippet:\n\n${snippet}` }
          ],
          max_tokens: 30,
          temperature: 0.1
        })
      });

      if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
        throw new Error('Malformed classification response from OpenRouter.');
      }

      const content = payload.choices[0].message.content.trim();
      logger.info('AIAnalyzer', `Raw classification response: "${content}"`);
      
      // Sanitize the response
      const allowedTypes = ['Resume', 'CV', 'Academic Result', 'DGS', 'Invoice', 'Unknown'];
      const matchedType = allowedTypes.find(type => content.toLowerCase().includes(type.toLowerCase()));
      
      if (matchedType) {
        return matchedType;
      }
      
      throw new Error(`LLM returned invalid classification type: "${content}"`);
    } catch (error) {
      logger.error('AIAnalyzer', `❌ Classification attempt ${attempt + 1} failed: ${error.message}`);
      
      if (isTerminalError(error)) {
        logger.warn('AIAnalyzer', '⚠️ Terminal OpenRouter error detected during classification. Falling back to heuristics immediately.');
        return runHeuristicClassification(snippet);
      }
      
      attempt++;
      if (attempt > maxRetries) {
        logger.warn('AIAnalyzer', '⚠️ Classification API failed. Falling back to heuristics.');
        return runHeuristicClassification(snippet);
      }
      await sleep(200); // Small delay when switching models to avoid long timeouts
    }
  }
};

module.exports = {
  analyzeResumeText,
  analyzeSkillGap,
  generateInterviewQuestions,
  classifyDocument,
  extractProjectsFromText,
  getMockInterviewQuestions,
  getMockRoleBasedAts
};
