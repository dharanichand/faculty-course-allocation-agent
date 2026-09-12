# Faculty Course Allocation Agent — Dataset Integrated

Full-stack React/Vite + Express faculty-course allocation dashboard with:
- Large college-aligned synthetic dataset
- Faculty/course/request/workload pages
- Agentic AI chat with Groq/OpenAI-compatible tool calling
- Deterministic recommendation scoring
- What-if simulation without database mutation
- HOD human-in-the-loop approve/reject/override
- Conflict detection and resolution
- Local dataset mode by default
- Optional MongoDB persistence mode

## Run

Requirements: Node.js 18+.

From the project root:

```bash
npm run install:all
```

Keep your own existing `server/.env`. Do NOT create or commit a new secrets file.

Start backend:

```bash
npm run dev:server
```

Start frontend in a second terminal:

```bash
npm run dev:client
```

Open the Vite URL, normally:

```text
http://localhost:5173
```

## Dataset

The project already contains the large dataset under:

```text
server/data/
```

Important files include:

- `faculty.csv` — 120 faculty
- `faculty_expertise.csv` — faculty expertise records
- `course.csv` — 70 courses
- `course_version.csv` — course-version records
- `course_offering.csv` — 300 offerings
- `section.csv` — sections
- `batch.csv` — batches
- `faculty_workload.csv` — workload metrics
- `faculty_allocation_candidates.csv` — 1,500 agent allocation candidates
- `department.csv`, `person.csv`, `programme.csv`, `regulation.csv`, `academic_year.csv`, `term.csv`
- `agent.csv`, `agent_tool.csv`

The backend automatically loads the CSV dataset in local-memory mode. You do not need to manually import the CSV files into MongoDB to use the project.

## Agent

The agent uses Groq through the OpenAI-compatible API interface.

Your own `server/.env` should contain your Groq configuration, including your secret API key and optionally the model/base URL settings you already use.

The application falls back to deterministic local tool answers when `GROQ_API_KEY` is absent, so the dashboard and allocation workflow still work.

The agent never finalizes an allocation. HOD approval remains the final step.

## MongoDB

Dataset mode is the default because it makes the supplied college-aligned dataset immediately usable.

If you specifically want MongoDB-backed application data, set:

```env
DATA_SOURCE=mongodb
```

and provide your own valid `MONGO_URI`.

## Agent workflow

```text
User
  ↓
Agent
  ↓
Tool selection
  ↓
Faculty / Course / Workload / Request data
  ↓
Deterministic scoring
  ↓
Recommendation
  ↓
Conflict + constraint checks
  ↓
HOD Review
  ↓
Approve / Reject / Override
```

## Security

Never commit or share API keys, MongoDB credentials, or JWT secrets.
Keep secrets only in your own `server/.env`.
