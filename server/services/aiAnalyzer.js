/**
 * @file aiAnalyzer.js
 * @description Service layer for analyzing resume text using Anthropic Claude via OpenRouter API.
 * Contains resume insights, skill gap comparison, and interview prep questions generators.
 * Safely falls back to high-quality developer mocks if the API key is missing or credit-locked.
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');

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
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  return cleaned.trim();
};

// Validate API key format on startup/loading
const apiKey = process.env.OPENROUTER_API_KEY;
if (apiKey && !apiKey.startsWith('sk-or-')) {
  logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY does not start with standard "sk-or-" prefix. API calls may fail.');
}

/**
 * Validates the parsed JSON object to ensure it contains all required resume analysis fields.
 * @param {object} obj - Parsed JSON object.
 * @returns {boolean} - True if valid, false otherwise.
 */
const validateAnalysisResult = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  const requiredKeys = ['strengths', 'weaknesses', 'atsTips', 'rewriteSuggestions', 'missingKeywords', 'recruiterFeedback'];
  const hasKeys = requiredKeys.every(key => key in obj);
  if (!hasKeys) return false;
  
  const basicValid = Array.isArray(obj.strengths) && 
         Array.isArray(obj.weaknesses) && 
         Array.isArray(obj.atsTips) && 
         Array.isArray(obj.rewriteSuggestions) && 
         Array.isArray(obj.missingKeywords) && 
         typeof obj.recruiterFeedback === 'string';

  if (!basicValid) return false;

  if (obj.skillGap) {
    const sg = obj.skillGap;
    if (typeof sg !== 'object' || !Array.isArray(sg.matchedSkills) || !Array.isArray(sg.missingSkills) || !Array.isArray(sg.recommendedSkills) || !Array.isArray(sg.learningRoadmap)) {
      return false;
    }
  }

  if (obj.interviewPrep) {
    const ip = obj.interviewPrep;
    if (typeof ip !== 'object' || !Array.isArray(ip.technical) || !Array.isArray(ip.projectBased) || !Array.isArray(ip.behavioral) || !Array.isArray(ip.hrQuestions)) {
      return false;
    }
  }

  return true;
};

// Helper mock structures for fallback safety
const getMockResumeAnalysis = () => ({
  strengths: [
    "Well-structured sections that are easily read by parsers.",
    "Good list of technologies and skills included.",
    "GitHub link provided showcases active code contributions."
  ],
  weaknesses: [
    "Descriptions of experience lack quantifiable metrics or impact percentages.",
    "Work history description is brief and could detail more responsibilities."
  ],
  atsTips: [
    "Avoid using multi-column tables as some older ATS parsers read columns horizontally across lines.",
    "Use standard headings like 'Experience', 'Education', 'Skills', rather than creative variants."
  ],
  rewriteSuggestions: [
    "Instead of 'Worked on front-end features', write: 'Developed responsive user interface components using React 18, improving page load speeds by 15%'.",
    "Instead of 'Helped design database', write: 'Co-designed PostgreSQL schema and optimized index queries, reducing API latency by 200ms'."
  ],
  missingKeywords: [
    "CI/CD Pipelines",
    "Kubernetes",
    "Unit Testing (Jest/PyTest)",
    "System Architecture Design"
  ],
  recruiterFeedback: "The candidate demonstrates strong software engineering basics and project initiative. However, the experience section is too tasks-oriented rather than achievements-oriented. Quantifying accomplishments and highlighting collaboration with cross-functional teams will elevate the resume value.",
  skillGap: {
    targetRole: "Software Engineer",
    matchedSkills: ["Python", "JavaScript", "SQL", "Git"],
    missingSkills: ["Docker", "Kubernetes", "GraphQL"],
    recommendedSkills: ["TypeScript", "AWS Cloud Practitioner"],
    learningRoadmap: [
      "Phase 1: Complete Docker & Kubernetes basics course",
      "Phase 2: Learn TypeScript fundamentals and build a project",
      "Phase 3: Pass AWS Cloud Practitioner certification exam"
    ]
  },
  interviewPrep: {
    technical: [
      "Explain the difference between synchronous and asynchronous code in JavaScript.",
      "How do index caches optimize PostgreSQL database queries?",
      "What is the difference between Docker images and containers?"
    ],
    projectBased: [
      "How did you structure the microservices architecture on Kubernetes in your project?",
      "What was the main performance bottleneck you faced with PostgreSQL, and how did index caching resolve it?"
    ],
    behavioral: [
      "Describe a situation where you had a disagreement with a team member on architectural design.",
      "Tell me about a time you had to learn a new cloud technology quickly for a project."
    ],
    hrQuestions: [
      "Why are you interested in this Software Engineer role?",
      "Where do you see your technical skills progressing over the next few years?"
    ]
  }
});

const getMockSkillGap = (role) => {
  const lowerRole = (role || '').toLowerCase();
  if (lowerRole.includes('ai') || lowerRole.includes('machine learning') || lowerRole.includes('ml')) {
    return {
      matchedSkills: ["Python", "TensorFlow", "Machine Learning Core Concepts"],
      missingSkills: ["PyTorch", "Hugging Face Transformers", "LLM Fine-tuning / RAG"],
      recommendedSkills: ["Vector Databases (Pinecone/Milvus)", "Docker Deployment"],
      learningRoadmap: [
        "Phase 1: Deepen Deep Learning basics on Coursera (2-3 weeks)",
        "Phase 2: Complete the Hugging Face NLP Course (3-4 weeks)",
        "Phase 3: Implement fine-tuning models and store vectors in Pinecone (2 weeks)"
      ]
    };
  } else if (lowerRole.includes('data')) {
    return {
      matchedSkills: ["Python", "SQL", "Basic Data Analysis"],
      missingSkills: ["Pandas & NumPy", "Matplotlib/Seaborn Visualization"],
      recommendedSkills: ["Google BigQuery", "Airflow Data Orchestration"],
      learningRoadmap: [
        "Phase 1: Take the Google Data Analytics Certificate (3 weeks)",
        "Phase 2: Complete the Data Engineering Zoomcamp (4 weeks)",
        "Phase 3: Learn advanced SQL query optimization techniques (1 week)"
      ]
    };
  } else if (lowerRole.includes('front')) {
    return {
      matchedSkills: ["HTML5", "CSS3", "JavaScript (ES6+)"],
      missingSkills: ["React 18+", "TypeScript Type Safety"],
      recommendedSkills: ["Tailwind CSS Layouts", "Next.js / Server-Side Rendering"],
      learningRoadmap: [
        "Phase 1: Follow Epic React by Kent C. Dodds (2 weeks)",
        "Phase 2: Read TypeScript Deep Dive book and build small applications (2 weeks)",
        "Phase 3: Build a full-stack Next.js project using Tailwind CSS (3 weeks)"
      ]
    };
  } else {
    return {
      matchedSkills: ["HTML5", "CSS3", "JavaScript", "Node.js"],
      missingSkills: ["Express.js APIs", "React Components", "PostgreSQL database integration"],
      recommendedSkills: ["JWT Authentication", "Docker Containterization", "Git workflows"],
      learningRoadmap: [
        "Phase 1: Deep-dive into React and modular frontend code (3 weeks)",
        "Phase 2: Learn Express backend servers and REST API design rules (2 weeks)",
        "Phase 3: Integrate database queries and deploy using Docker (2 weeks)"
      ]
    };
  }
};

const getMockInterviewQuestions = () => ({
  technical: [
    "Explain how JavaScript handles asynchronous operations using the event loop.",
    "What are the key advantages of using a NoSQL database over a relational database, and when would you choose one?",
    "Explain the differences between supervised and unsupervised learning, and give examples of each."
  ],
  projectBased: [
    "In your projects, what was the primary architectural bottleneck, and how did you resolve it?",
    "How did you structure your testing suite (unit, integration) to ensure codebase stability?",
    "Could you walk me through your decision-making process when selecting the key dependencies for your application?"
  ],
  behavioral: [
    "Describe a time when you had to work with a teammate who had a very different technical perspective. How did you resolve the conflict?",
    "Tell me about a project that did not meet expectations or failed. What did you learn from the experience?",
    "How do you prioritize your learning when you need to quickly pick up a brand new language or framework for a project?"
  ],
  hrQuestions: [
    "Why do you want to join our team as an engineer?",
    "Where do you see yourself technically in the next three to five years?",
    "What do you think is the most challenging part of remote software development collaboration?"
  ]
});

/**
 * Executes a fetch request with a strict AbortController timeout.
 * @param {string} url
 * @param {object} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = OPENROUTER.REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
};

/**
 * Handles OpenRouter specific API error codes (402, 429, 503).
 * @param {Response} response
 * @throws {Error}
 */
const handleOpenRouterErrors = async (response) => {
  const status = response.status;
  let detailMessage = '';
  
  try {
    const body = await response.text();
    detailMessage = body ? ` - ${body}` : '';
  } catch (err) {
    // Ignore body read errors
  }

  if (status === 402) {
    throw new Error(`OpenRouter Credit Insufficient (402)${detailMessage}`);
  } else if (status === 429) {
    throw new Error(`OpenRouter Rate Limit Exceeded (429)${detailMessage}`);
  } else if (status === 503) {
    throw new Error(`OpenRouter Model Overloaded or Down (503)${detailMessage}`);
  } else {
    throw new Error(`OpenRouter API responded with status ${status}${detailMessage}`);
  }
};

/**
 * Sends resume text to Anthropic Claude via OpenRouter to analyze strengths, weaknesses, tips, and suggestions.
 */
const analyzeResumeText = async (text, maxRetries = OPENROUTER.MAX_RETRIES) => {
  if (!apiKey) {
    logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY is not configured. Returning mock analysis.');
    return getMockResumeAnalysis();
  }

  const systemPrompt = `You are an expert ATS recruiter and resume reviewer.

Analyze the resume and provide:
1. Strengths
2. Weaknesses
3. ATS optimization tips
4. Resume rewrite suggestions
5. Missing Keywords
6. General Recruiter Feedback
7. A targeted Skill Gap analysis matching standard industry expectations for the candidate's target job role (e.g. Software Engineer) based on their resume
8. A list of tailored Interview Preparation questions

You must return ONLY a valid JSON object containing these exact keys:
- "strengths": array of strings
- "weaknesses": array of strings
- "atsTips": array of strings
- "rewriteSuggestions": array of strings
- "missingKeywords": array of strings
- "recruiterFeedback": string
- "skillGap": object containing:
  - "targetRole": string
  - "matchedSkills": array of strings
  - "missingSkills": array of strings
  - "recommendedSkills": array of strings
  - "learningRoadmap": array of strings (timeline steps formatted as "Phase X: Description")
- "interviewPrep": object containing:
  - "technical": array of strings
  - "projectBased": array of strings
  - "behavioral": array of strings
  - "hrQuestions": array of strings

Do not include any preamble, introduction, markdown code block backticks (like \`\`\`json), or trailing notes.`;

  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      logger.info('AIAnalyzer', `🤖 Requesting Claude analysis via OpenRouter (Attempt ${attempt + 1}/${maxRetries + 1})...`);
      
      const response = await fetchWithTimeout(OPENROUTER.URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5000',
          'X-Title': 'AI Resume Analyzer'
        },
        body: JSON.stringify({
          model: OPENROUTER.MODEL_ID,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Extracted Resume Text:\n\n${text}` }
          ],
          response_format: { type: 'json_object' },
          max_tokens: OPENROUTER.MAX_TOKENS,
          temperature: OPENROUTER.TEMPERATURE
        })
      });

      if (!response.ok) {
        await handleOpenRouterErrors(response);
      }

      const payload = await response.json();
      
      if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
        throw new Error('Malformed completion response structure received from OpenRouter API.');
      }

      // Log cost and token metrics
      if (payload.usage) {
        logger.info('AIAnalyzer', 'Claude completion usage metrics:', {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens
        });
      }

      const content = payload.choices[0].message.content;
      logger.info('AIAnalyzer', '✅ Received completion from Claude.');

      const cleanedContent = cleanJsonString(content);
      let parsed = JSON.parse(cleanedContent);

      if (!validateAnalysisResult(parsed)) {
        throw new Error('Analysis payload is missing required schema keys.');
      }

      return parsed;

    } catch (error) {
      logger.error('AIAnalyzer', `❌ Attempt ${attempt + 1} failed: ${error.message}`);
      
      attempt++;
      if (attempt <= maxRetries) {
        const delay = Math.pow(2, attempt) * OPENROUTER.BACKOFF_BASE_MS;
        logger.info('AIAnalyzer', `🕒 Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        logger.warn('AIAnalyzer', '⚠️ Maximum retries reached or credit-locked. Falling back to local developer mock analysis.');
        return getMockResumeAnalysis();
      }
    }
  }
};

/**
 * Validates the parsed JSON object to ensure it contains all required skill gap analysis fields.
 */
const validateSkillGapResult = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  const requiredKeys = ['matchedSkills', 'missingSkills', 'recommendedSkills', 'learningRoadmap'];
  return requiredKeys.every(key => Array.isArray(obj[key]));
};

/**
 * Performs a skill gap analysis for a candidate's resume text against a target industry role.
 */
const analyzeSkillGap = async (resumeText, targetRole, maxRetries = OPENROUTER.MAX_RETRIES) => {
  const role = targetRole || 'Software Engineer';

  if (!apiKey) {
    logger.warn('AIAnalyzer', `⚠️ OPENROUTER_API_KEY is not configured. Returning mock skill gap results for "${role}".`);
    return getMockSkillGap(role);
  }

  const systemPrompt = `You are an expert technical recruiter and talent assessor.

Compare the candidate's resume skills against standard industry expectations for the target role: "${role}".

Determine:
1. Matched Skills
2. Missing Skills
3. Recommended Skills
4. Learning Roadmap

You must return ONLY a valid JSON object containing these exact keys:
- "matchedSkills": array of strings
- "missingSkills": array of strings
- "recommendedSkills": array of strings
- "learningRoadmap": array of strings

Do not include any preamble, introduction, markdown code block backticks (like \`\`\`json), or trailing notes.`;

  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      logger.info('AIAnalyzer', `🤖 Requesting Claude skill gap analysis via OpenRouter (Attempt ${attempt + 1}/${maxRetries + 1})...`);
      
      const response = await fetchWithTimeout(OPENROUTER.URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5000',
          'X-Title': 'AI Resume Analyzer'
        },
        body: JSON.stringify({
          model: OPENROUTER.MODEL_ID,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Target Role: ${role}\n\nResume Text:\n\n${resumeText}` }
          ],
          response_format: { type: 'json_object' },
          max_tokens: OPENROUTER.MAX_TOKENS,
          temperature: OPENROUTER.TEMPERATURE
        })
      });

      if (!response.ok) {
        await handleOpenRouterErrors(response);
      }

      const payload = await response.json();
      
      if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
        throw new Error('Malformed completion response structure received from OpenRouter API.');
      }

      // Log cost and token metrics
      if (payload.usage) {
        logger.info('AIAnalyzer', 'Claude completion usage metrics (Skill Gap):', {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens
        });
      }

      const content = payload.choices[0].message.content;
      logger.info('AIAnalyzer', '✅ Received completion from Claude for skill gap analysis.');

      const cleanedContent = cleanJsonString(content);
      let parsed = JSON.parse(cleanedContent);

      if (!validateSkillGapResult(parsed)) {
        throw new Error('Skill gap analysis payload is missing required schema keys.');
      }

      return parsed;

    } catch (error) {
      logger.error('AIAnalyzer', `❌ Attempt ${attempt + 1} failed: ${error.message}`);
      
      attempt++;
      if (attempt <= maxRetries) {
        const delay = Math.pow(2, attempt) * OPENROUTER.BACKOFF_BASE_MS;
        logger.info('AIAnalyzer', `🕒 Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        logger.warn('AIAnalyzer', `⚠️ Skill gap analysis API failed. Falling back to local developer mock skill gap for "${role}".`);
        return getMockSkillGap(role);
      }
    }
  }
};

/**
 * Validates the parsed JSON object to ensure it contains all required interview questions fields.
 */
const validateInterviewQuestionsResult = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  
  const requiredKeys = ['technical', 'projectBased', 'behavioral', 'hrQuestions'];
  return requiredKeys.every(key => Array.isArray(obj[key]));
};

/**
 * Generates customized technical, project-specific, behavioral, and HR interview questions based on resume content.
 */
const generateInterviewQuestions = async (resumeText, maxRetries = OPENROUTER.MAX_RETRIES) => {
  if (!apiKey) {
    logger.warn('AIAnalyzer', '⚠️ OPENROUTER_API_KEY is not configured. Returning mock interview questions.');
    return getMockInterviewQuestions();
  }

  const systemPrompt = `You are an expert technical interviewer and talent evaluator.

Analyze the candidate's resume content, specifically focusing on their skills, projects, education, and work experience.

Generate customized interview questions:
1. Technical questions
2. Project-based questions
3. Behavioral questions
4. HR questions

You must return ONLY a valid JSON object containing these exact keys:
- "technical": array of strings
- "projectBased": array of strings
- "behavioral": array of strings
- "hrQuestions": array of strings

Do not include any preamble, introduction, markdown code block backticks (like \`\`\`json), or trailing notes.`;

  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      logger.info('AIAnalyzer', `🤖 Requesting Claude interview questions via OpenRouter (Attempt ${attempt + 1}/${maxRetries + 1})...`);
      
      const response = await fetchWithTimeout(OPENROUTER.URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5000',
          'X-Title': 'AI Resume Analyzer'
        },
        body: JSON.stringify({
          model: OPENROUTER.MODEL_ID,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Resume Text:\n\n${resumeText}` }
          ],
          response_format: { type: 'json_object' },
          max_tokens: OPENROUTER.MAX_TOKENS,
          temperature: OPENROUTER.TEMPERATURE
        })
      });

      if (!response.ok) {
        await handleOpenRouterErrors(response);
      }

      const payload = await response.json();
      
      if (!payload.choices || payload.choices.length === 0 || !payload.choices[0].message) {
        throw new Error('Malformed completion response structure received from OpenRouter API.');
      }

      // Log cost and token metrics
      if (payload.usage) {
        logger.info('AIAnalyzer', 'Claude completion usage metrics (Interview Questions):', {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens
        });
      }

      const content = payload.choices[0].message.content;
      logger.info('AIAnalyzer', '✅ Received completion from Claude for interview questions.');

      const cleanedContent = cleanJsonString(content);
      let parsed = JSON.parse(cleanedContent);

      if (!validateInterviewQuestionsResult(parsed)) {
        throw new Error('Interview questions payload is missing required schema keys.');
      }

      return parsed;

    } catch (error) {
      logger.error('AIAnalyzer', `❌ Attempt ${attempt + 1} failed: ${error.message}`);
      
      attempt++;
      if (attempt <= maxRetries) {
        const delay = Math.pow(2, attempt) * OPENROUTER.BACKOFF_BASE_MS;
        logger.info('AIAnalyzer', `🕒 Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        logger.warn('AIAnalyzer', '⚠️ Interview questions API failed. Falling back to local developer mock questions.');
        return getMockInterviewQuestions();
      }
    }
  }
};

module.exports = {
  analyzeResumeText,
  analyzeSkillGap,
  generateInterviewQuestions
};
