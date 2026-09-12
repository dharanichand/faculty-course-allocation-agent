# Faculty Course Allocation Agent

A full-stack faculty-course allocation dashboard with React/Vite, Express, MongoDB support, deterministic allocation data, LangGraph/OpenAI agent support, and HOD human-in-the-loop approval.

## Run locally

1. Install Node.js 18+.
2. From the project root:

```bash
npm run install:all
```

3. Configure `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/faculty_allocation
JWT_SECRET=replace-with-a-long-secret
DEMO_MODE=true
OPENAI_MODEL=gpt-5.6-luna
OPENAI_API_KEY=your_openai_api_key
```

The OpenAI key is optional for the dashboard CRUD/review workflow. The application uses demo fallback data when MongoDB is unavailable. Add an API key only when you want the AI agent to call OpenAI.

4. Start the backend in one terminal:

```bash
npm run dev:server
```

5. Start the frontend in another:

```bash
npm run dev:client
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## What works without OpenAI credits

- Dashboard navigation and live counts
- Faculty add/deactivate/search
- Course add/deactivate
- Faculty request submission and review
- Conflict creation, details and resolution
- HOD approve/reject/override
- Review queue automatically clears after a decision
- Demo fallback data when MongoDB is unavailable

The AI Agent page requires a working OpenAI API key with available API quota. ChatGPT subscription billing and API billing are separate.

## Dataset

You can later add/import your faculty, course and request dataset. The data layer is separated from the UI so the demo records can be replaced by MongoDB/imported records.

## Security

Never commit a real API key, MongoDB password, or JWT secret. Keep them in `server/.env` only.
