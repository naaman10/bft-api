# Assessment System Documentation

Complete documentation for the BFT API assessment system.

## Quick Links

- **[Assessment System Overview](assessment-system.md)** - Start here for API reference and workflow documentation
- **[Design Decisions](assessment-design-decisions.md)** - Understand the architecture and trade-offs
- **[Frontend Integration Guide](assessment-frontend-guide.md)** - Implementation examples for admin UI

## What is the Assessment System?

The assessment system allows admin users to manually grade student enrollments that require human review. It supports:

- ✅ Grading individual questions with points
- ✅ Providing question-level feedback
- ✅ Providing overall assessment feedback
- ✅ Adding general feedback to any enrollment
- ✅ Draft/work-in-progress grading
- ✅ Completing assessments to award points
- ✅ Full audit trail of who graded what and when

## When to Use What

### For Content Requiring Assessment

**Content with `requiresAssessment: true` in Contentful:**

1. Student completes enrollment → `progress_status` becomes `to_assess`
2. Admin uses `/admin/review/:enrollmentId` to view answers
3. Admin uses `/admin/assessment/:enrollmentId` to grade questions
4. Admin uses `/admin/assessment/:enrollmentId/complete` to finalize
5. System updates enrollment to `assessed` and records points

**Workflow:** `not_started` → `in_progress` → `to_assess` → **grading** → `assessed`

### For General Feedback

**Any enrollment (with or without assessment):**

- Use `/admin/enrollment/:enrollmentId/feedback` endpoints
- Multiple feedback entries can be added over time
- Independent of assessment status
- Works for auto-marked content too

## Architecture at a Glance

### Database Tables

```
assessments
├── id (PK)
├── enrollment_id (FK, UNIQUE)
├── assessed_by (admin user UUID)
└── status ('in_progress' | 'completed')

assessment_question_grades
├── id (PK)
├── assessment_id (FK)
├── question_id (Contentful entry ID)
├── points_earned (0..points_available)
└── points_available

assessment_question_feedback
├── id (PK)
├── assessment_id (FK)
├── question_id
└── feedback (text)

assessment_feedback
├── id (PK)
├── assessment_id (FK, UNIQUE)
└── feedback (text)

enrollment_feedback
├── id (PK)
├── enrollment_id (FK)
├── feedback (text)
└── created_by (admin user UUID)
```

### API Endpoints

| Endpoint | Purpose | When |
|----------|---------|------|
| `POST /admin/assessment/:id` | Save/update grades & feedback | During grading |
| `POST /admin/assessment/:id/complete` | Finalize assessment | When done grading |
| `GET /admin/assessment/:id` | Retrieve assessment | Resume grading |
| `POST /admin/enrollment/:id/feedback` | Add general feedback | Anytime |
| `GET /admin/enrollment/:id/feedback` | List feedback | Anytime |

## Key Design Principles

1. **Separation of Concerns**
   - Assessments for content requiring manual grading
   - Feedback for any enrollment
   - Clear boundaries between draft and completed states

2. **Data Integrity**
   - Validation at API, business logic, and database layers
   - Atomic completion with transactions
   - Foreign keys and constraints prevent invalid data

3. **Flexibility**
   - Save work in progress
   - Update grades/feedback before completion
   - Partial credit supported (e.g., 5 out of 10 points)

4. **Audit Trail**
   - Track who performed each assessment
   - Timestamp all changes
   - Immutable after completion

5. **Extensibility**
   - Easy to add rubrics, history, batch operations
   - Prepared for future enhancements
   - Clean separation makes changes isolated

## Getting Started

### For Developers

1. **Read the API Reference**
   - [assessment-system.md](assessment-system.md) has complete endpoint documentation
   - Request/response examples for all endpoints
   - Error codes and validation rules

2. **Understand the Design**
   - [assessment-design-decisions.md](assessment-design-decisions.md) explains why things work the way they do
   - Useful for debugging and extending the system

3. **Implement the Frontend**
   - [assessment-frontend-guide.md](assessment-frontend-guide.md) has complete React/TypeScript examples
   - Copy-paste ready code samples
   - UI/UX best practices

### For Admins

1. **Check enrollment status**
   - Only enrollments with `progress_status: 'to_assess'` need grading
   - Use existing `/admin/review/:enrollmentId` to view submissions

2. **Grade the assessment**
   - Call `POST /admin/assessment/:enrollmentId` with grades and feedback
   - Can be called multiple times (draft state)
   - Save as you go to avoid losing work

3. **Complete when ready**
   - Call `POST /admin/assessment/:enrollmentId/complete`
   - System validates all questions are graded
   - Points awarded and enrollment marked `assessed`

4. **Add feedback anytime**
   - Use `POST /admin/enrollment/:enrollmentId/feedback` for general comments
   - Works for any enrollment, assessed or not
   - Multiple entries allowed

## Migration

Run the migration to create tables:

```bash
npm run migrate
```

This executes `migrations/007_assessments.sql` which creates all five tables with proper indexes and constraints.

## Testing

### Manual Testing Flow

1. **Setup:**
   ```bash
   # Ensure database is running
   npm run migrate
   
   # Start the API
   npm run dev
   ```

2. **Create test data:**
   - Create a student
   - Enroll in content with `requiresAssessment: true`
   - Have student complete the enrollment (use `/learn/content/:id/progress`)
   - Verify enrollment is now `to_assess`

3. **Test grading:**
   ```bash
   # Get review data
   curl -X POST http://localhost:4000/admin/review/{enrollmentId} \
     -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"adminUserId":"admin-uuid"}'
   
   # Save grades
   curl -X POST http://localhost:4000/admin/assessment/{enrollmentId} \
     -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "assessedBy": "admin-uuid",
       "questionGrades": [
         {"questionId": "q1", "pointsEarned": 5, "pointsAvailable": 10}
       ]
     }'
   
   # Complete assessment
   curl -X POST http://localhost:4000/admin/assessment/{enrollmentId}/complete \
     -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"assessedBy":"admin-uuid"}'
   
   # Verify enrollment is now 'assessed' and points recorded
   ```

4. **Test feedback:**
   ```bash
   # Add feedback
   curl -X POST http://localhost:4000/admin/enrollment/{enrollmentId}/feedback \
     -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"feedback":"Great job!","createdBy":"admin-uuid"}'
   
   # List feedback
   curl -X GET http://localhost:4000/admin/enrollment/{enrollmentId}/feedback \
     -H "X-Admin-Api-Key: $ADMIN_API_KEY"
   ```

### Integration Tests

See [assessment-frontend-guide.md](assessment-frontend-guide.md) for test examples.

## Common Issues & Solutions

### "Enrollment is not ready for assessment"

**Cause:** Enrollment `progress_status` is not `to_assess` or `assessed`.

**Solution:** Student must complete the enrollment first. Use `PATCH /learn/content/:id/progress` with `action: "complete"`.

### "Content does not require assessment"

**Cause:** Contentful entry has `requiresAssessment: false` or undefined.

**Solution:** Use general feedback endpoints instead. Assessment endpoints only work for content requiring manual review.

### "Invalid question ID"

**Cause:** Question ID doesn't match any question in the content's marking scheme.

**Solution:** Get question IDs from `POST /admin/review/:enrollmentId` response. Use the `questionId` field from the questions array.

### "Points available mismatch"

**Cause:** Frontend sent different `pointsAvailable` than defined in Contentful.

**Solution:** Use the `points` value from the review endpoint. Don't hardcode or allow editing.

### "Cannot complete assessment: Missing grades for questions"

**Cause:** Not all questions have grades assigned.

**Solution:** Grade every question before completing. Check the questions array from review endpoint.

### "Assessment is already completed"

**Cause:** Trying to update or re-complete a finished assessment.

**Solution:** Assessments are immutable after completion. Would need a separate "reassessment" feature.

## Future Enhancements

Potential additions (not yet implemented):

- **Rubrics** - Structured grading criteria per question
- **History** - Track changes to grades over time
- **Batch grading** - Grade multiple enrollments at once
- **Notifications** - Email students when assessed
- **Reassessment** - Allow reopening completed assessments
- **Templates** - Pre-filled feedback templates
- **Reports** - Analytics on grading patterns
- **Collaboration** - Multiple assessors, comments, discussion

See [assessment-design-decisions.md](assessment-design-decisions.md) for extensibility discussion.

## Support

Questions? Issues? Check:

1. **API errors** - Read the error message, check validation rules in [assessment-system.md](assessment-system.md)
2. **Design questions** - See rationale in [assessment-design-decisions.md](assessment-design-decisions.md)
3. **Frontend issues** - Check examples in [assessment-frontend-guide.md](assessment-frontend-guide.md)
4. **Database** - Verify migration ran, check table structure in `migrations/007_assessments.sql`

## Contributing

When extending the assessment system:

1. **Read the design doc first** - Understand the principles and constraints
2. **Maintain data integrity** - Use transactions, constraints, validation
3. **Update all docs** - Keep API reference, design decisions, and frontend guide in sync
4. **Test thoroughly** - Manual testing plus integration tests
5. **Consider extensibility** - Will your change make future additions harder?

## License

Same as the main BFT API project.
