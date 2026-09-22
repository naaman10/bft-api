# Assessment System Architecture

Visual overview of the assessment system components and their relationships.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Admin Frontend                              │
│                     (React/TypeScript UI)                            │
└────────────┬────────────────────────────────────────┬───────────────┘
             │                                        │
             │ HTTP Requests                          │
             │ (X-Admin-Api-Key)                     │
             ▼                                        ▼
┌─────────────────────────────┐      ┌──────────────────────────────┐
│   Review Endpoint           │      │  Feedback Endpoints          │
│  POST /admin/review/:id     │      │  POST/GET                    │
│  - Get student answers      │      │  /admin/enrollment/:id/      │
│  - Get correct answers      │      │     feedback                 │
│  - View all questions       │      │  (Works for ALL enrollments) │
└─────────────┬───────────────┘      └──────────────┬───────────────┘
              │                                      │
              │                                      │
              ▼                                      ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Assessment Endpoints                            │
│  POST /admin/assessment/:id          - Save/update grades         │
│  POST /admin/assessment/:id/complete - Finalize assessment        │
│  GET  /admin/assessment/:id          - Retrieve assessment        │
└───────────────────┬───────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                  Assessment Business Logic                         │
│                   (src/lib/assessments.ts)                         │
│                                                                    │
│  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────┐ │
│  │ saveAssessment() │  │completeAssessment()│  │getFeedback() │ │
│  │  - Validate      │  │  - Validate all    │  │  - Query     │ │
│  │  - Save grades   │  │  - Begin txn       │  │  - Return    │ │
│  │  - Save feedback │  │  - Update status   │  │    history   │ │
│  └────────┬─────────┘  └──────────┬─────────┘  └──────────────┘ │
│           │                       │                               │
└───────────┼───────────────────────┼───────────────────────────────┘
            │                       │
            ▼                       ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Database Layer (PostgreSQL)                    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                        enrollments                            ││
│  │  - progress_status: 'to_assess' → 'assessed'                 ││
│  │  - Links to assessments via enrollment_id                    ││
│  └───────────────────────┬──────────────────────────────────────┘│
│                          │ (FK)                                   │
│  ┌───────────────────────▼──────────────────────────────────────┐│
│  │                      assessments                              ││
│  │  - enrollment_id (UNIQUE)                                     ││
│  │  - assessed_by (admin UUID)                                   ││
│  │  - status ('in_progress' → 'completed')                       ││
│  └───┬───────────────────────┬───────────────────────────────┬──┘│
│      │ (FK)                  │ (FK)                          │    │
│      ▼                       ▼                               ▼    │
│  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────┐│
│  │ question_grades│  │question_feedback │  │assessment_feedback ││
│  │ - question_id  │  │ - question_id    │  │ - feedback (text)  ││
│  │ - points_earned│  │ - feedback (text)│  │ (Overall feedback) ││
│  │ - points_avail │  │ (Per question)   │  └────────────────────┘│
│  └────────────────┘  └──────────────────┘                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                   enrollment_feedback                         ││
│  │  - enrollment_id (FK to enrollments)                          ││
│  │  - feedback (text)                                            ││
│  │  - created_by (admin UUID)                                    ││
│  │  (Multiple entries allowed, for all enrollments)              ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                          points                               ││
│  │  - Created on assessment completion                           ││
│  │  - source: 'assessment' (vs 'automatic')                      ││
│  │  - awarded_by: admin UUID                                     ││
│  │  - Only for points_earned > 0                                 ││
│  └──────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Assessment Workflow

```
┌──────────────┐
│   Student    │
│  Completes   │
│  Enrollment  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│  Enrollment Status:      │
│  progress_status         │
│  = 'to_assess'           │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Admin Reviews           │
│  POST /admin/review/:id  │
│  Gets: questions,        │
│        student answers,  │
│        correct answers   │
└──────┬───────────────────┘
       │
       ▼
┌────────────────────────────────┐
│  Admin Grades (Draft Mode)     │
│  POST /admin/assessment/:id    │
│  Saves:                        │
│  - question_grades             │
│  - question_feedback           │
│  - overall_feedback            │
│  (Can repeat multiple times)   │
└──────┬─────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  Admin Completes                 │
│  POST /admin/assessment/:id/     │
│       complete                   │
│                                  │
│  ┌─────────── Transaction ─────┐│
│  │ 1. Validate all graded      ││
│  │ 2. Update assessment status ││
│  │ 3. Update enrollment status ││
│  │ 4. Insert points records    ││
│  └─────────────────────────────┘│
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Final State:            │
│  - assessment.status     │
│    = 'completed'         │
│  - enrollment.status     │
│    = 'assessed'          │
│  - points recorded       │
└──────────────────────────┘
```

### Feedback Workflow

```
┌────────────────┐
│  Any Enrollment│
│  (Any Status)  │
└────────┬───────┘
         │
         ▼
┌───────────────────────────┐
│  Admin Adds Feedback      │
│  POST /admin/enrollment/  │
│       :id/feedback        │
│                           │
│  Creates new row in:      │
│  enrollment_feedback      │
│  (Multiple allowed)       │
└───────────────────────────┘
         │
         ▼
┌───────────────────────────┐
│  View Feedback History    │
│  GET /admin/enrollment/   │
│      :id/feedback         │
│                           │
│  Returns all feedback     │
│  for this enrollment      │
└───────────────────────────┘
```

## Component Relationships

### Database Entity Relationships

```
enrollments (1) ──────── (1) assessments
    │                         │
    │                         ├─── (N) assessment_question_grades
    │                         ├─── (N) assessment_question_feedback
    │                         └─── (1) assessment_feedback
    │
    └────────────────── (N) enrollment_feedback

enrollments (1) ──────── (N) points
                              (Created on assessment completion)
```

### Code Module Dependencies

```
┌───────────────────────┐
│  src/routes/admin.ts  │
│  (HTTP Layer)         │
└──────────┬────────────┘
           │ uses
           ▼
┌──────────────────────────┐
│ src/lib/assessments.ts   │
│ (Business Logic)         │
└──────────┬───────────────┘
           │ uses
           ├─────────────────┐
           ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│ src/lib/db.ts    │  │src/lib/content.ts│
│ (Database)       │  │(Contentful)      │
└──────────────────┘  └──────────────────┘
           │                 │
           ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│  PostgreSQL DB   │  │  Contentful API  │
└──────────────────┘  └──────────────────┘
```

## Request/Response Flow

### Saving Assessment (Happy Path)

```
Client                API                Business Logic         Database
  │                   │                        │                   │
  │─── POST ─────────▶│                        │                   │
  │  /assessment/:id  │                        │                   │
  │  + grades         │                        │                   │
  │  + feedback       │                        │                   │
  │                   │                        │                   │
  │                   │─── saveAssessment() ──▶│                   │
  │                   │                        │                   │
  │                   │                        │─── BEGIN ────────▶│
  │                   │                        │                   │
  │                   │                        │─── Check enroll ─▶│
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── Check content ▶│
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── Validate ─────▶│
  │                   │                        │    questions      │
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── UPSERT ───────▶│
  │                   │                        │    assessment     │
  │                   │                        │◀── ID ────────────│
  │                   │                        │                   │
  │                   │                        │─── UPSERT ───────▶│
  │                   │                        │    grades         │
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── UPSERT ───────▶│
  │                   │                        │    feedback       │
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── COMMIT ───────▶│
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │◀── Assessment Data ────│                   │
  │                   │                        │                   │
  │◀── 200 OK ────────│                        │                   │
  │  + assessment     │                        │                   │
  │  + grades         │                        │                   │
  │  + feedback       │                        │                   │
```

### Completing Assessment (Happy Path)

```
Client                API                Business Logic         Database
  │                   │                        │                   │
  │─── POST ─────────▶│                        │                   │
  │  /assessment/:id/ │                        │                   │
  │  complete         │                        │                   │
  │                   │                        │                   │
  │                   │─── complete() ────────▶│                   │
  │                   │                        │                   │
  │                   │                        │─── BEGIN TXN ───▶│
  │                   │                        │                   │
  │                   │                        │─── Check all ────▶│
  │                   │                        │    graded?        │
  │                   │                        │◀── Yes ───────────│
  │                   │                        │                   │
  │                   │                        │─── UPDATE ───────▶│
  │                   │                        │    assessment     │
  │                   │                        │    status=done    │
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── UPDATE ───────▶│
  │                   │                        │    enrollment     │
  │                   │                        │    status=assessed│
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── INSERT ───────▶│
  │                   │                        │    points (where  │
  │                   │                        │    earned > 0)    │
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │                        │─── COMMIT ───────▶│
  │                   │                        │◀── OK ────────────│
  │                   │                        │                   │
  │                   │◀── Assessment Data ────│                   │
  │                   │                        │                   │
  │◀── 200 OK ────────│                        │                   │
  │  + assessment     │                        │                   │
  │    status=done    │                        │                   │
```

## Validation Layers

```
┌────────────────────────────────────────────────────────────┐
│                      API Layer (Zod)                       │
│  - Type validation                                         │
│  - Required fields                                         │
│  - Basic format (UUID, email, etc.)                        │
└───────────────────────┬────────────────────────────────────┘
                        │ Pass ✓
                        ▼
┌────────────────────────────────────────────────────────────┐
│                 Business Logic Layer                       │
│  - Enrollment exists and correct status                    │
│  - Content requires assessment                             │
│  - Question IDs valid                                      │
│  - Points match marking scheme                             │
│  - Points in valid range                                   │
│  - All questions graded (on complete)                      │
└───────────────────────┬────────────────────────────────────┘
                        │ Pass ✓
                        ▼
┌────────────────────────────────────────────────────────────┐
│                    Database Layer                          │
│  - Foreign key constraints                                 │
│  - Unique constraints                                      │
│  - Check constraints                                       │
│  - NOT NULL constraints                                    │
│  - Type constraints                                        │
└────────────────────────────────────────────────────────────┘
```

## State Transitions

### Assessment Status States

```
          saveAssessment()
              first call
                  │
                  ▼
           ┌─────────────┐
           │             │
      ┌───▶│in_progress  │◀──┐
      │    │             │   │
      │    └─────────────┘   │
      │           │          │
      │           │          │
      └───────────┘          │
       saveAssessment()      │
        subsequent calls     │
                             │
             complete()      │
             fails          │
                             │
         complete()          │
           success          │
              │              │
              ▼              │
       ┌─────────────┐       │
       │  completed  │       │
       │  (FINAL)    │       │
       └─────────────┘       │
              │              │
              │              │
       No further changes ───┘
```

### Enrollment Progress Status States (Assessment Path)

```
not_started → in_progress → to_assess → [ASSESSMENT] → assessed
                                             │
                                             │
                                             ▼
                                    Admin grades with
                                    assessment endpoints
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Client Request                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              CORS Middleware                            │
│  - Check origin against FRONTEND_URL                    │
└───────────────────────┬─────────────────────────────────┘
                        │ Pass ✓
                        ▼
┌─────────────────────────────────────────────────────────┐
│          requireAdmin Middleware                        │
│  - Verify X-Admin-Api-Key header                        │
│  - Compare to ADMIN_API_KEY env var                     │
└───────────────────────┬─────────────────────────────────┘
                        │ Pass ✓
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Route Handler                              │
│  - Process request                                      │
│  - Access database                                      │
│  - Return response                                      │
└─────────────────────────────────────────────────────────┘
```

## Performance Considerations

### Database Indexes

```
assessments
  - PRIMARY KEY (id)
  - INDEX (enrollment_id)     ← Fast lookup by enrollment
  - INDEX (assessed_by)       ← Fast lookup by assessor
  - INDEX (status)            ← Fast filtering by status

assessment_question_grades
  - PRIMARY KEY (id)
  - INDEX (assessment_id)     ← Fast join to assessment
  - INDEX (question_id)       ← Fast lookup by question
  - UNIQUE (assessment_id, question_id)  ← Prevent duplicates

assessment_question_feedback
  - PRIMARY KEY (id)
  - INDEX (assessment_id)     ← Fast join to assessment
  - INDEX (question_id)       ← Fast lookup by question
  - UNIQUE (assessment_id, question_id)  ← Prevent duplicates

assessment_feedback
  - PRIMARY KEY (id)
  - INDEX (assessment_id)     ← Fast join to assessment
  - UNIQUE (assessment_id)    ← One per assessment

enrollment_feedback
  - PRIMARY KEY (id)
  - INDEX (enrollment_id)     ← Fast lookup by enrollment
  - INDEX (created_by)        ← Fast lookup by creator
```

### Query Patterns

```sql
-- Most common query: Get full assessment
SELECT a.*, 
       array_agg(qg.*) as grades,
       array_agg(qf.*) as question_feedback,
       af.feedback as overall_feedback
FROM assessments a
LEFT JOIN assessment_question_grades qg ON qg.assessment_id = a.id
LEFT JOIN assessment_question_feedback qf ON qf.assessment_id = a.id
LEFT JOIN assessment_feedback af ON af.assessment_id = a.id
WHERE a.enrollment_id = $1
GROUP BY a.id, af.feedback;

-- Fast because: All indexed foreign keys, UNIQUE constraints
```

## Monitoring & Observability

### Key Metrics to Track

```
┌──────────────────────────────────────────────┐
│  Application Metrics                         │
│  - Assessment creation rate                  │
│  - Assessment completion rate                │
│  - Average time to complete                  │
│  - Draft assessments (in_progress)           │
│  - Failed validation attempts                │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Database Metrics                            │
│  - Query latency (p50, p95, p99)            │
│  - Transaction rollback rate                 │
│  - Connection pool usage                     │
│  - Index hit rate                            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Business Metrics                            │
│  - Enrollments awaiting assessment           │
│  - Average points awarded                    │
│  - Assessor workload distribution            │
│  - Feedback utilization rate                 │
└──────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
└───────────────────────┬─────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ API     │   │ API     │   │ API     │
    │ Node 1  │   │ Node 2  │   │ Node 3  │
    └────┬────┘   └────┬────┘   └────┬────┘
         │             │             │
         └─────────────┼─────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   PostgreSQL    │
              │   (Primary)     │
              └────────┬────────┘
                       │
                       │ Replication
                       ▼
              ┌─────────────────┐
              │   PostgreSQL    │
              │   (Replica)     │
              └─────────────────┘
```

## Summary

The assessment system is architected with:

- **Layered validation** for data integrity
- **Atomic transactions** for consistency
- **Proper indexes** for performance
- **Clear separation** of concerns
- **Comprehensive documentation** for maintainability
- **Extensible design** for future enhancements

All components work together to provide a robust, scalable solution for grading student enrollments.
