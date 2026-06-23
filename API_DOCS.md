# AI Resume Analyzer REST API Documentation

The AI Resume Analyzer provides endpoints for resume uploading, text parsing, modular ATS scoring, Claude AI analysis, skill gap mapping, and interview prep questions generation.

---

## Global API Configuration

### Headers
Every API request must include the following headers (except public/pre-auth routes):
```http
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

### Rate Limiting
API requests are governed by sliding-window rate limiters:
- **Resume Uploads (`/api/upload`, `/api/analyze`)**: Max 5 requests per 5 minutes per client IP.
- **General Completion APIs (`/api/skills/gap`, `/api/interview/questions`, `/api/history`, `/api/analysis/:id`)**: Max 60 requests per 1 minute per client IP.

The following headers are returned on every rate-limited endpoint:
- `X-RateLimit-Limit`: Maximum requests allowed in the current window.
- `X-RateLimit-Remaining`: Number of requests remaining in the window.
- `X-RateLimit-Reset`: Time when the current rate limit resets (ISO format).

---

## Endpoint Reference

### 1. Health Check
Checks the server status and connection parameters.
- **URL**: `/api/health`
- **Method**: `GET`
- **Auth Required**: No
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Server is healthy and running",
    "timestamp": "2026-06-21T10:45:00.000Z"
  }
  ```

---

### 2. Analyze Resume
Parses a PDF resume file, calculates the ATS score, requests Claude AI review analysis, and saves the record.
- **URL**: `/api/upload` (Alias: `/api/analyze`)
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `multipart/form-data`
- **Request Payload**:
  - `resume`: File (PDF format only, maximum 5MB)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "analysisId": "analysis_f1e2d3c4-b5a6-9788-7766-554433221100",
    "userId": "firebase_user_uid",
    "resumeName": "Jane_Doe_Resume.pdf",
    "score": 85,
    "breakdown": {
      "contact": 10,
      "summary": 10,
      "education": 10,
      "skills": 15,
      "projects": 16,
      "experience": 12,
      "certifications": 3,
      "portfolio": 5,
      "keywords": 3,
      "formatting": 5
    },
    "explanations": {
      "contact": "Awarded full points...",
      "summary": "Awarded full points..."
    },
    "strengths": [
      "Well-structured sections that are easily read by parsers."
    ],
    "weaknesses": [
      "Descriptions of experience lack quantifiable metrics."
    ],
    "recommendations": [
      "Add your missing certifications."
    ],
    "atsTips": [
      "Avoid using multi-column tables."
    ],
    "rewriteSuggestions": [
      "Instead of 'Worked on front-end features', write..."
    ],
    "missingKeywords": [
      "Kubernetes"
    ],
    "missingSections": [
      "Certifications"
    ],
    "recruiterFeedback": "The candidate demonstrates strong software engineering basics...",
    "text": "Jane Doe \nSoftware Engineer...",
    "createdAt": "2026-06-21T10:45:00.000Z"
  }
  ```

---

### 3. Get Analysis History
Retrieves all historical analysis summaries for the logged-in user, sorted chronologically (newest first).
- **URL**: `/api/history`
- **Method**: `GET`
- **Auth Required**: Yes
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "history": [
      {
        "analysisId": "analysis_uuid_1",
        "userId": "firebase_user_uid",
        "resumeName": "Jane_Doe_Resume.pdf",
        "score": 85,
        "createdAt": "2026-06-21T10:45:00.000Z"
      }
    ]
  }
  ```

---

### 4. Get Analysis By ID
Retrieves the complete detail of a specific past resume analysis by its analysis ID.
- **URL**: `/api/analysis/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Success Response (200 OK)**:
  Matches the details response block of the `/api/upload` endpoint.
- **Error Response (403 Forbidden)**:
  If the requested analysis record is owned by a different user.
  ```json
  {
    "status": "error",
    "code": "FORBIDDEN",
    "message": "Access denied. You are not authorized to view this analysis.",
    "timestamp": "2026-06-21T10:45:00.000Z"
  }
  ```

---

### 5. Skill Gap Analysis
Compares the candidate's resume text against standard expectations for a chosen target industry role.
- **URL**: `/api/skills/gap`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`
- **Request Payload (Body)**:
  ```json
  {
    "resumeText": "Raw text content of the resume...",
    "targetRole": "AI Engineer"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "matchedSkills": [
      "Python",
      "TensorFlow"
    ],
    "missingSkills": [
      "PyTorch",
      "LLM Fine-tuning"
    ],
    "recommendedSkills": [
      "Vector Databases",
      "Docker"
    ],
    "learningRoadmap": [
      "Phase 1: Deepen Deep Learning basics...",
      "Phase 2: Complete the Hugging Face NLP Course..."
    ]
  }
  ```

---

### 6. Interview Questions Generator
Generates personalized technical, project-based, behavioral, and HR interview questions based on the candidate's experience.
- **URL**: `/api/interview/questions`
- **Method**: `POST`
- **Auth Required**: Yes
- **Content-Type**: `application/json`
- **Request Payload (Body)**:
  ```json
  {
    "resumeText": "Raw text content of the resume..."
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "technical": [
      "Explain how JavaScript handles asynchronous operations using the event loop."
    ],
    "projectBased": [
      "In your projects, what was the primary architectural bottleneck, and how did you resolve it?"
    ],
    "behavioral": [
      "Describe a time when you had to work with a teammate who had a very different perspective..."
    ],
    "hrQuestions": [
      "Why do you want to join our team as an engineer?"
    ]
  }
  ```

---

### 7. Legacy History (Backwards Compatibility)
Retrieves legacy mocked history values.
- **URL**: `/api/resumes/history`
- **Method**: `GET`
- **Auth Required**: Yes (Updated for security)
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "1",
        "fileName": "Jane_Doe_Resume_2026.pdf",
        "overallScore": 82,
        "analyzedAt": "2026-06-20T16:00:00.000Z"
      }
    ]
  }
  ```

---

## Global Error Responses

When an error occurs, the API returns a consistent JSON payload structure. Stack traces are only included in the `development` environment.

### Format
```json
{
  "status": "error",
  "code": "ERROR_CODE",
  "message": "Human-readable description of what went wrong.",
  "timestamp": "2026-06-21T10:45:00.000Z"
}
```

### Common Error Codes
- `UNAUTHORIZED`: Invalid or missing ID token in the authorization header.
- `AUTH_TOKEN_EXPIRED`: The provided Firebase ID token has expired.
- `RATE_LIMIT_EXCEEDED`: Exceeded request frequency limits.
- `MISSING_FILE`: No file uploaded in the multipart request.
- `FILE_TOO_LARGE`: Uploaded file size exceeds the 5MB limit.
- `UNSUPPORTED_FILE_TYPE`: Uploaded file is not in PDF format.
- `TEXT_TOO_LONG`: Provided `resumeText` exceeds the 50,000 character limit.
- `FORBIDDEN`: Accessing a resource owned by another user.
- `NOT_FOUND`: The requested endpoint or analysis record does not exist.
- `INTERNAL_SERVER_ERROR`: Generic fallback for unexpected backend exceptions.
