# Assessment System Design Decisions

## Architecture Overview

The assessment system is designed with separation of concerns, flexibility, and data integrity as primary goals.

## Database Design

### Why Five Tables?

We separated the data into five distinct tables rather than using a monolithic approach:

1. **`assessments`** - Core assessment lifecycle
   - UNIQUE on `enrollment_id` ensures one assessment per enrollment
   - Status tracking (`in_progress` → `completed`) allows draft work
   - Timestamp tracking provides audit trail

2. **`assessment_question_grades`** - Grading data
   - Separate table allows flexible querying and reporting
   - UNIQUE constraint on `(assessment_id, question_id)` prevents duplicate grades
   - CHECK constraints enforce valid point ranges
   - Easy to aggregate statistics across questions

3. **`assessment_question_feedback`** - Question-specific feedback
   - Separate from grades allows optional feedback
   - Not all questions need feedback
   - Can add feedback without grades (though API currently requires both for completion)

4. **`assessment_feedback`** - Overall feedback
   - Separate from question feedback for clear semantic distinction
   - UNIQUE constraint ensures one overall feedback per assessment
   - Optional - assessments can be completed without it

5. **`enrollment_feedback`** - General feedback independent of assessments
   - Works for ALL enrollments, not just those requiring assessment
   - Multiple entries allowed (no unique constraint)
   - Separate table from assessments because:
     - Feedback can exist without assessment
     - Assessment may not exist for auto-marked content
     - Different access patterns and lifecycle

### Why Not JSONB?

We considered storing grades and feedback as JSONB columns but chose relational tables because:

- **Querying** - Easy to query "all grades for question X" or "average points for question Y"
- **Constraints** - Database enforces point ranges and uniqueness at the row level
- **Indexes** - Can index on `question_id` for fast lookups
- **Flexibility** - Easy to add columns (e.g., grading rubric, grading time)
- **Joins** - Can join with other tables for reporting
- **Type Safety** - Stronger guarantees than JSON validation

## API Design

### Why Separate Save and Complete?

Admin users need to save draft work:

- Grading takes time - admins may grade in multiple sessions
- May need to consult with colleagues before finalizing
- May want to provide feedback before deciding final points
- Can update grades if they make a mistake (before completion)

Once completed:
- Enrollment status changes to `assessed`
- Points are recorded
- Cannot be modified (would require separate "regrade" feature)

### Why Validate on Save?

We validate question IDs and point ranges on save (not just on complete) because:

- **Fail fast** - Better UX to catch errors immediately
- **Data integrity** - Invalid data never enters the database
- **Clear errors** - Admin sees exactly what's wrong while context is fresh
- **Simpler completion** - Completion only needs to check all questions are graded

### Why Separate Feedback Endpoints?

Enrollment feedback is separate from assessments because:

- **Different scope** - Works for ALL enrollments, not just assessed ones
- **Different lifecycle** - Can be added before, during, or after assessment
- **Different permissions** - May want different access control in future
- **Simpler API** - Clear intent: assessment vs general feedback

## Points System Integration

### When Are Points Recorded?

Points are only recorded when an assessment is **completed**, not on save:

- **Draft protection** - Work-in-progress grades don't affect student records
- **Atomic** - Points, enrollment status, and assessment status change together
- **Consistent** - Matches the automatic marking flow
- **Audit** - Clear timestamp of when points were awarded

### Why Filter Zero Points?

We only insert `points` rows when `points_earned > 0`:

- **Consistent with automatic marking** - Automatic system only records correct answers
- **Efficient** - Smaller points table
- **Meaningful data** - Points table represents achievements, not failures
- **Simpler queries** - "Total points" is just SUM, no need to filter zeros

The grades table stores all scores (including zeros) for complete assessment records.

### Source: 'assessment' vs 'automatic'

The `points.source` field distinguishes:

- `'automatic'` - Auto-marked questions (no human review)
- `'assessment'` - Manually graded by admin

Benefits:
- Can filter/report by source
- Can identify which points came from assessments
- Future: May want different point weights or display

## Transaction Design

### Why Use Transactions for Completion?

Completion uses `sql.begin()` to ensure atomicity:

```typescript
await sql.begin(async (tx) => {
  // 1. Mark assessment completed
  // 2. Update enrollment to 'assessed'
  // 3. Insert points records
});
```

Benefits:
- **All-or-nothing** - Either everything succeeds or nothing changes
- **Consistency** - Impossible to have completed assessment without points
- **Recovery** - On error, everything rolls back cleanly
- **Concurrency** - Isolation prevents race conditions

## Validation Strategy

### Multi-Layer Validation

1. **API Layer** (Zod schemas)
   - Type checking
   - Required fields
   - Basic format validation

2. **Business Logic Layer** (`assessments.ts`)
   - Enrollment exists and has correct status
   - Content requires assessment
   - Question IDs are valid
   - Points match marking scheme
   - All questions graded (on complete)

3. **Database Layer** (constraints)
   - Foreign keys
   - Unique constraints
   - Check constraints
   - Type constraints

This defense-in-depth approach prevents invalid data at every level.

## Error Handling

### Custom Error Class

`AssessmentError` with HTTP status codes:

```typescript
throw new AssessmentError(403, "Enrollment is not ready for assessment");
```

Benefits:
- **Clear semantics** - Error intent is obvious
- **HTTP mapping** - Status code included
- **Catchable** - Routes can catch and respond appropriately
- **Consistent** - All assessment errors use same pattern

### Detailed Error Messages

Error messages are specific and actionable:

- ❌ "Invalid request" 
- ✅ "Points earned must be between 0 and 10 for question abc123"

Benefits:
- **Better UX** - Admin knows exactly what to fix
- **Debugging** - Clear logs for troubleshooting
- **Self-documenting** - Error messages explain the rules

## Scalability Considerations

### Current Design Trade-offs

**Optimized for:**
- Data integrity
- Clear semantics
- Audit trail
- Query flexibility

**Not yet optimized for:**
- Millions of assessments (but structure supports it)
- Real-time collaboration (no conflict resolution beyond completion lock)
- History tracking (grades are updated in place)

### Future Scaling Options

If needed, could add:
- **Partitioning** - Partition tables by date or student
- **Archiving** - Move old assessments to archive tables
- **Caching** - Cache assessment data for frequent lookups
- **History** - Add history tables to track changes over time
- **Soft deletes** - Add `deleted_at` if retention required

Current design makes these additions straightforward.

## Security Considerations

### Access Control

Currently:
- All assessment endpoints require `requireAdmin` middleware
- Admin API key required
- No student access to assessment data

Future:
- Could add `assessed_by` field checks (admin can only see their own)
- Could add role-based access (assessor vs reviewer)
- Could add student access to completed assessments (read-only)

### Data Exposure

- Student answers come from progress (already visible to students)
- Correct answers from Contentful (admin-only endpoint)
- Grades and feedback are admin-only (not exposed to students yet)

Future: May want student-facing endpoints to view completed assessments.

## Extensibility

### Easy to Add

The design makes these additions straightforward:

1. **Rubrics** - Add `rubrics` table linked to assessments
2. **Comments** - Add `assessment_comments` for discussion
3. **History** - Add `assessment_history` to track changes
4. **Notifications** - Add email/webhook when assessment completed
5. **Batch operations** - Endpoint to grade multiple enrollments
6. **Templates** - Pre-filled feedback templates
7. **Reports** - Analytics on grading patterns

### Difficult to Change

These would require significant refactoring:

1. **Multiple assessors** - Currently one `assessed_by` per assessment
2. **Partial grading** - Currently must grade all questions
3. **Reassessment** - Currently locked after completion
4. **Points modification** - Would need to handle point adjustments

These are intentional constraints for v1 simplicity.

## Conclusion

The assessment system prioritizes:

1. **Data integrity** - Constraints and validation at every layer
2. **Clear semantics** - Each table has a single, clear purpose
3. **Flexibility** - Easy to query, report, and extend
4. **Simplicity** - Straightforward workflows with clear states
5. **Audit trail** - Who did what and when

Trade-offs were made for v1 launch speed while maintaining extensibility for future needs.
