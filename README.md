# AI Resume Analyzer

An AI-powered Resume Analyzer that evaluates resumes using ATS-style scoring, identifies skill gaps, generates recruiter-style feedback, and helps candidates improve their chances of getting shortlisted.

The platform allows users to upload resumes, receive detailed ATS analysis, identify missing skills, prepare for interviews, and track previous analyses through a personalized dashboard.

---

## Features

### Authentication

* Email & Password Login
* User Registration
* Secure Firebase Authentication
* Persistent User Sessions

### Resume Analysis

* PDF Resume Upload
* Resume Text Extraction
* ATS Compatibility Scoring
* Section-by-Section Resume Evaluation
* Resume Strength Analysis
* Resume Improvement Suggestions

### ATS Score Breakdown

* Contact Information Analysis
* Education Evaluation
* Skills Assessment
* Experience Review
* Projects Evaluation
* Resume Formatting Analysis

### Skill Gap Analysis

* Missing Skills Detection
* Improvement Recommendations
* Learning Suggestions
* Career Readiness Insights

### Interview Preparation

* AI-Generated Technical Questions
* Behavioral Interview Questions
* Resume-Based Questions
* Personalized Preparation Guidance

### Recruiter Feedback

* Recruiter Perspective Review
* Hiring Readiness Assessment
* Resume Improvement Recommendations

### Dashboard & History

* Analysis History
* ATS Score Tracking
* Highest Score Tracking
* Average Score Calculation
* Previous Report Access

---

## Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript (ES6+)

### Backend

* Node.js
* Express.js

### Database

* Firebase Realtime Database

### Authentication

* Firebase Authentication

### AI Integration

* OpenRouter
* Anthropic Claude Models

### File Processing

* Multer
* PDF Parse

---

## Dependencies

### Production

* express
* cors
* dotenv
* firebase-admin
* helmet
* multer
* pdf-parse

### Development

* nodemon

---

## Project Structure

```text
AI-Resume-Analyzer/
│
├── client/
│   ├── css/
│   ├── js/
│   ├── assets/
│   └── index.html
│
├── server/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── config/
│   └── server.js
│
├── .env
├── package.json
├── README.md
└── firebase/
```

---

## How It Works

### Step 1

User signs in or creates an account.

### Step 2

User uploads a PDF resume.

### Step 3

The system extracts text from the uploaded resume.

### Step 4

The extracted content is analyzed using AI.

### Step 5

The system generates:

* ATS Score
* ATS Breakdown
* Skill Gap Analysis
* Recruiter Feedback
* Interview Questions
* Improvement Suggestions

### Step 6

The analysis is stored securely and linked to the authenticated user.

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd AI-Resume-Analyzer
```

Install all required dependencies:

```bash
npm install
```

---

## Environment Variables

Create a `.env` file in the project root directory:

```env
PORT=5000

GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key

FIREBASE_DATABASE_URL=your_firebase_database_url

FIREBASE_PROJECT_ID=your_project_id

FIREBASE_CLIENT_EMAIL=your_client_email

FIREBASE_PRIVATE_KEY=your_private_key
```

---

## Running Locally

Start the application:

```bash
npm run start
```

Development mode:

```bash
npm run dev
```

Server URL:

```text
http://localhost:5000
```

Health Check Endpoint:

```text
http://localhost:5000/api/health
```

---

## API Endpoints

### Health Check

```http
GET /api/health
```

### Resume Analysis

```http
POST /api/analyze
```

### User Analysis History

```http
GET /api/history
```

### Dashboard Statistics

```http
GET /api/dashboard/stats
```

---

## Database Structure

```text
users/
 └── {uid}
      ├── profile
      └── analyses
           └── {analysisId}

analyses/
 └── {analysisId}
```

---

## Security Features

* Firebase Authentication
* Helmet Security Middleware
* Environment Variable Protection
* User-Specific Analysis Storage
* Secure API Communication

---

## Future Improvements

* Resume Comparison
* Job Description Matching
* Cover Letter Generation
* LinkedIn Profile Analysis
* Resume Version Tracking
* AI Career Roadmaps
* Exportable PDF Reports

---

## Troubleshooting

### Server Not Starting

Reinstall dependencies:

```bash
npm install
```

Run the server:

```bash
npm run start
```

### Firebase Connection Issues

Verify:

* Firebase credentials
* Database URL
* Service account configuration

### AI Integration Issues

Verify:

* API key validity (GEMINI_API_KEY, OPENAI_API_KEY)
* Provider quotas and rate limits
* Google Gemini / OpenAI service status

---

## License

This project is intended for educational, portfolio, and research purposes.

---

## Author

**Naman Prajapati**

B.Tech CSE (AI/ML)

Passionate about Artificial Intelligence, Web Development, and Building Intelligent Career Tools.

