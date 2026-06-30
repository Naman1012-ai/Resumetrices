import { auth, isMockMode } from './firebase-config.js';

const API_BASE = '/api';

let cachedDashboardStats = null;
const analysisCache = new Map();

const FirebaseService = {
  getApiBase() {
    return API_BASE;
  },
  
  clearCache() {
    cachedDashboardStats = null;
    analysisCache.clear();
  },

  async getDashboardStats() {
    if (isMockMode) {
      return {
        totalAnalyses: 12,
        highestScore: 92,
        averageScore: 78,
        analysesThisMonth: 5,
        recentImprovement: 14,
        recentAnalysis: {
          analysisId: 'mock_1',
          resumeName: 'John_Doe_CV.pdf',
          targetRole: 'Senior Full Stack Engineer',
          score: 92,
          createdAt: Date.now() - 1000 * 60 * 60 * 2,
          skillGap: [
            { skill: 'Docker', gapType: 'Technical', recommendation: 'Build a containerized sample project.' },
            { skill: 'Kubernetes', gapType: 'Technical', recommendation: 'Deploy a cluster to Minikube.' },
            { skill: 'AWS Lambda', gapType: 'Technical', recommendation: 'Write serverless function handlers.' }
          ],
          interviewPrep: [
            { question: 'What is the difference between Docker and a VM?', answer: 'Containers share the host OS kernel, while VMs run a full guest OS.' },
            { question: 'Explain React Server Components.', answer: 'Components that render on the server, saving bundle size.' }
          ]
        },
        historySummary: [
          { analysisId: 'mock_1', resumeName: 'John_Doe_CV.pdf', targetRole: 'Senior Full Stack Engineer', score: 92, createdAt: Date.now() - 1000 * 60 * 60 * 2 },
          { analysisId: 'mock_2', resumeName: 'John_Doe_CV_v1.pdf', targetRole: 'Full Stack Engineer', score: 78, createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3 }
        ],
        roleDistribution: {
          'Senior Full Stack Engineer': 8,
          'Backend Developer': 4
        },
        monthlyScans: { 'Jun': 5, 'May': 4, 'Apr': 3 },
        commonMissingSkills: [
          { skill: 'Docker', count: 6 },
          { skill: 'Kubernetes', count: 5 },
          { skill: 'AWS Lambda', count: 4 }
        ]
      };
    }
    const user = auth.currentUser;
    if (!user) throw new Error('Authorization required.');
    
    if (cachedDashboardStats) {
      return cachedDashboardStats;
    }

    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE}/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to retrieve dashboard stats.');
    cachedDashboardStats = data.stats;
    return data.stats;
  },

  async deleteAnalysis(analysisId) {
    const user = auth.currentUser;
    if (!user) throw new Error('Authorization required.');
    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE}/analysis/${analysisId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to delete analysis.');
    cachedDashboardStats = null; // Invalidate dashboard cache
    return true;
  },

  async renameAnalysis(analysisId, newName) {
    if (isMockMode) {
      cachedDashboardStats = null;
      return true;
    }
    const user = auth.currentUser;
    if (!user) throw new Error('Authorization required.');
    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE}/analysis/${analysisId}/rename`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ resumeName: newName })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to rename analysis.');
    cachedDashboardStats = null; // Invalidate dashboard cache
    return true;
  },

  async purgeUserData() {
    if (isMockMode) {
      cachedDashboardStats = null;
      return true;
    }
    const user = auth.currentUser;
    if (!user) throw new Error('Authorization required.');
    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE}/users/profile`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to purge user data.');
    cachedDashboardStats = null;
    return true;
  },

  async loadAnalysisById(analysisId) {
    if (analysisCache.has(analysisId)) {
      return analysisCache.get(analysisId);
    }

    if (isMockMode) {
      const mockResult = {
        analysisId: analysisId,
        resumeName: analysisId === 'mock_2' ? 'John_Doe_CV_v1.pdf' : 'John_Doe_CV.pdf',
        targetRole: analysisId === 'mock_2' ? 'Full Stack Engineer' : 'Senior Full Stack Engineer',
        score: analysisId === 'mock_2' ? 78 : 92,
        createdAt: Date.now() - 1000 * 60 * 60 * 2,
        breakdown: {
          contact: { score: 9, reasoning: 'Found professional email and github links.' },
          formatting: { score: 9, reasoning: 'Standard one-page layout with clear sections.' },
          skills: { score: 18, reasoning: 'Matches 85% of core skills required for Senior role.' },
          experience: { score: 17, reasoning: 'Strong quantitative metrics shown in bullet points.' },
          projects: { score: 14, reasoning: 'Detailed project examples using container stack.' },
          education: { score: 9, reasoning: 'Degree in Computer Science matches requirements.' },
          keywords: { score: 8, reasoning: 'Found Python, React, Docker. Missing AWS, Lambda.' },
          achievements: { score: 4, reasoning: 'Showed leadership leading developer teams.' }
        },
        strengths: [
          'Strong tech stack matches job description requirements perfectly.',
          'Quantified experience bullets show business value impact.'
        ],
        weaknesses: [
          'Missing key cloud platform details (e.g. AWS).',
          'Formatting is slightly dense; improve readability whitespace.'
        ],
        missingKeywords: ['Docker', 'Kubernetes', 'AWS Lambda'],
        missingSections: ['Certifications', 'Portfolio'],
        rewriteSuggestions: [
          { original: 'Responsible for maintaining backend scripts.', suggestion: 'Architected and optimized automated Python backend scripts, reducing execution latency by 35%.' }
        ],
        atsTips: [
          'Utilize standard chronological formatting.',
          'Avoid complex columns or tables that confuse parser tools.'
        ],
        recruiterFeedback: 'Highly recommended for backend or full stack engineering roles. Strong Python stack alignment.',
        skillGap: [
          { skill: 'Docker', gapType: 'Technical', recommendation: 'Build a containerized sample project.' },
          { skill: 'Kubernetes', gapType: 'Technical', recommendation: 'Deploy a cluster to Minikube.' },
          { skill: 'AWS Lambda', gapType: 'Technical', recommendation: 'Write serverless function handlers.' }
        ],
        interviewPrep: {
          technical: [
            { question: 'What is the difference between Docker and a VM?', answer: 'Containers share the host OS kernel, while VMs run a full guest OS.' },
            { question: 'Explain React Server Components.', answer: 'Components that render on the server, saving bundle size.' }
          ],
          projectBased: [
            { question: 'Walk through the architecture of a project you led.', answer: 'Designed a microservices architecture using Docker and Kubernetes for horizontal scaling.' }
          ],
          domainKnowledge: [
            { question: 'Explain your experience with Python.', answer: 'Lead backend developer implementing Django microservices.' }
          ],
          behavioral: [
            { question: 'Describe a time you solved a hard technical bottleneck.', answer: 'Optimized DB queries, improving read times by 40%.' }
          ],
          hrQuestions: [
            { question: 'Why are you leaving your current role?', answer: 'Seeking new challenges in advanced cloud scaling.' }
          ]
        }
      };
      analysisCache.set(analysisId, mockResult);
      return mockResult;
    }

    const user = auth.currentUser;
    if (!user) throw new Error('Authorization required.');
    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE}/analysis/${analysisId}`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to retrieve analysis.');

    const analysis = data.analysis;
    analysisCache.set(analysisId, analysis);
    return analysis;
  },

  async loadAnalysisHistory() {
    if (isMockMode) {
      return [
        { analysisId: 'mock_1', resumeName: 'John_Doe_CV.pdf', targetRole: 'Senior Full Stack Engineer', score: 92, createdAt: Date.now() - 1000 * 60 * 60 * 2 },
        { analysisId: 'mock_2', resumeName: 'John_Doe_CV_v1.pdf', targetRole: 'Full Stack Engineer', score: 78, createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3 }
      ];
    }
    const user = auth.currentUser;
    if (!user) throw new Error('Authorization required.');
    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE}/history`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to load history.');
    return data.history || [];
  }
};

export { API_BASE, FirebaseService };
