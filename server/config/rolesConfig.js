/**
 * @file rolesConfig.js
 * @description Centralized roles configuration for Target Role Driven ATS Analysis.
 * Defines essential (primary) and recommended (secondary) skills for each job role.
 * Easily extensible to add new job roles.
 */

const rolesConfig = {
  'Software Engineer': {
    essential: ['javascript', 'python', 'java', 'c++', 'sql', 'git', 'rest api', 'docker'],
    recommended: ['typescript', 'node.js', 'aws', 'ci/cd', 'unit testing', 'agile']
  },
  'Frontend Developer': {
    essential: ['react', 'javascript', 'html', 'css', 'typescript', 'tailwind', 'sass', 'redux'],
    recommended: ['angular', 'vue', 'next.js', 'webpack', 'vite', 'figma', 'responsive design', 'accessibility']
  },
  'Backend Developer': {
    essential: ['node.js', 'express', 'python', 'java', 'spring', 'sql', 'postgresql', 'mongodb'],
    recommended: ['mysql', 'redis', 'apis', 'rest api', 'grpc', 'microservices', 'docker', 'authentication']
  },
  'Full Stack Developer': {
    essential: ['react', 'node.js', 'javascript', 'typescript', 'sql', 'postgresql', 'mongodb', 'rest api'],
    recommended: ['express', 'aws', 'docker', 'ci/cd', 'redux', 'tailwind', 'git', 'authentication']
  },
  'AI/ML Engineer': {
    essential: ['python', 'tensorflow', 'pytorch', 'machine learning', 'deep learning', 'numpy', 'pandas', 'scikit-learn'],
    recommended: ['mlops', 'nlp', 'computer vision', 'keras', 'huggingface', 'langchain', 'docker', 'sql']
  },
  'Data Scientist': {
    essential: ['python', 'sql', 'pandas', 'numpy', 'scikit-learn', 'machine learning', 'statistics', 'data analysis'],
    recommended: ['r', 'tableau', 'powerbi', 'spark', 'hadoop', 'data visualization', 'matplotlib', 'seaborn']
  },
  'Data Analyst': {
    essential: ['sql', 'powerbi', 'excel', 'statistics', 'data visualization', 'python', 'pandas', 'tableau'],
    recommended: ['data analysis', 'reporting', 'dashboard', 'cleaning', 'mysql', 'spreadsheets', 'analytics']
  },
  'DevOps Engineer': {
    essential: ['docker', 'kubernetes', 'ci/cd', 'jenkins', 'terraform', 'aws', 'gcp', 'azure'],
    recommended: ['ansible', 'linux', 'bash', 'shell scripting', 'git', 'prometheus', 'grafana', 'nginx']
  },
  'Cloud Engineer': {
    essential: ['aws', 'gcp', 'azure', 'cloud', 'terraform', 'docker', 'kubernetes', 'networking'],
    recommended: ['ci/cd', 'security', 'monitoring', 'linux', 'iam', 's3', 'serverless', 'lambda']
  },
  'Mobile Developer': {
    essential: ['swift', 'swiftui', 'kotlin', 'android', 'ios', 'react native', 'flutter', 'java'],
    recommended: ['objective-c', 'mobile', 'apis', 'cocoapods', 'gradle', 'xcode', 'app store', 'play store']
  },
  'Cybersecurity Analyst': {
    essential: ['security', 'cybersecurity', 'penetration', 'cryptography', 'network security', 'owasp', 'firewall', 'infosec'],
    recommended: ['siem', 'soc', 'vulnerability', 'wireshark', 'linux', 'threat modeling', 'incident response']
  },
  'QA Engineer': {
    essential: ['testing', 'selenium', 'cypress', 'jest', 'automation', 'qa', 'manual testing', 'bug tracking'],
    recommended: ['postman', 'apis', 'javascript', 'python', 'ci/cd', 'jira', 'agile', 'test cases']
  },
  'Product Manager': {
    essential: ['product management', 'roadmap', 'agile', 'scrum', 'jira', 'wireframing', 'analytics', 'user stories'],
    recommended: ['strategy', 'leadership', 'communication', 'sql', 'market research', 'ux', 'kpis', 'goal setting']
  },
  'UI/UX Designer': {
    essential: ['figma', 'ui/ux', 'design', 'wireframing', 'prototyping', 'user research', 'photoshop', 'illustrator'],
    recommended: ['sketch', 'adobe', 'interaction design', 'typography', 'user testing', 'css', 'html', 'design system']
  },
  'Other': {
    essential: ['javascript', 'python', 'java', 'sql', 'git', 'communication', 'problem solving', 'teamwork'],
    recommended: ['agile', 'documentation', 'testing', 'apis', 'project management']
  }
};

module.exports = rolesConfig;
