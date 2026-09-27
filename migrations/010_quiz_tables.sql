-- Quiz Generator Database Schema
-- PostgreSQL / Neon Database
-- Migration: 010_quiz_tables.sql
--
-- This migration creates the quiz generator system tables and functions
-- It renames gem_hunt_questions to questions for shared use across games
-- References existing 'students' table from bft-api

-- Enable UUID extension (may already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rename gem_hunt_questions to questions for shared use
-- This is safe if already renamed, and handles the case where it hasn't been
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'gem_hunt_questions'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'questions'
    ) THEN
        ALTER TABLE gem_hunt_questions RENAME TO questions;
        
        -- Rename indexes
        ALTER INDEX IF EXISTS idx_gem_hunt_questions_year_subject RENAME TO idx_questions_year_subject;
        ALTER INDEX IF EXISTS idx_gem_hunt_questions_difficulty RENAME TO idx_questions_difficulty;
        ALTER INDEX IF EXISTS idx_gem_hunt_questions_active RENAME TO idx_questions_active;
        
        -- Update trigger if it exists
        DROP TRIGGER IF EXISTS update_gem_hunt_questions_updated_at ON questions;
        CREATE TRIGGER update_questions_updated_at
            BEFORE UPDATE ON questions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Update gem_hunt_question_responses foreign key to reference questions table
-- This ensures backward compatibility with Gem Hunt
DO $$
BEGIN
    -- Drop old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'gem_hunt_question_responses_question_id_fkey'
    ) THEN
        ALTER TABLE gem_hunt_question_responses 
        DROP CONSTRAINT gem_hunt_question_responses_question_id_fkey;
    END IF;
    
    -- Add new constraint pointing to questions table
    ALTER TABLE gem_hunt_question_responses 
    ADD CONSTRAINT gem_hunt_question_responses_question_id_fkey 
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
END $$;

-- Quiz results table
CREATE TABLE IF NOT EXISTS quiz_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    year_group VARCHAR(50) NOT NULL,
    subject VARCHAR(100),
    total_questions INT NOT NULL,
    correct_answers INT NOT NULL,
    incorrect_answers INT NOT NULL,
    score_percentage DECIMAL(5, 2) NOT NULL,
    time_taken_seconds INT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_student ON quiz_results(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_game_type ON quiz_results(game_type);
CREATE INDEX IF NOT EXISTS idx_quiz_results_year_subject ON quiz_results(year_group, subject);
CREATE INDEX IF NOT EXISTS idx_quiz_results_completed ON quiz_results(completed_at DESC);

-- Quiz question responses table
CREATE TABLE IF NOT EXISTS quiz_question_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_result_id UUID NOT NULL REFERENCES quiz_results(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_answer VARCHAR(255),
    is_correct BOOLEAN NOT NULL,
    time_taken_seconds INT,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_result ON quiz_question_responses(quiz_result_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_question ON quiz_question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_correctness ON quiz_question_responses(is_correct);

-- Function: Get random questions (supports subject filter and all subjects)
CREATE OR REPLACE FUNCTION get_random_questions(
    p_year_group VARCHAR,
    p_subject VARCHAR DEFAULT NULL,
    p_count INT DEFAULT 5,
    p_difficulty INT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    question_text TEXT,
    year_group VARCHAR,
    subject VARCHAR,
    difficulty_level INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.question_text,
        q.year_group,
        q.subject,
        q.difficulty_level
    FROM questions q
    WHERE q.year_group = p_year_group
        AND q.active = TRUE
        AND (p_subject IS NULL OR q.subject = p_subject)
        AND (p_difficulty IS NULL OR q.difficulty_level = p_difficulty)
    ORDER BY RANDOM()
    LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get available subjects for a year group
CREATE OR REPLACE FUNCTION get_available_subjects(p_year_group VARCHAR)
RETURNS TABLE(subject VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT q.subject::VARCHAR
    FROM questions q
    WHERE q.year_group = p_year_group
        AND q.active = TRUE
    ORDER BY q.subject;
END;
$$ LANGUAGE plpgsql;

-- Function: Get all year groups
CREATE OR REPLACE FUNCTION get_available_year_groups()
RETURNS TABLE(year_group VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT q.year_group::VARCHAR
    FROM questions q
    WHERE q.active = TRUE
    ORDER BY q.year_group;
END;
$$ LANGUAGE plpgsql;

-- Update gem_hunt functions to use the renamed questions table
CREATE OR REPLACE FUNCTION get_gem_hunt_random_questions(
    p_year_group VARCHAR,
    p_subject VARCHAR,
    p_count INT DEFAULT 5,
    p_difficulty INT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    question_text TEXT,
    year_group VARCHAR,
    subject VARCHAR,
    difficulty_level INT
) AS $$
BEGIN
    -- Just call the new generic function
    RETURN QUERY
    SELECT * FROM get_random_questions(p_year_group, p_subject, p_count, p_difficulty);
END;
$$ LANGUAGE plpgsql;

-- Update question statistics trigger to use questions table
CREATE OR REPLACE FUNCTION update_gem_hunt_question_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions
    SET
        times_asked = times_asked + 1,
        times_correct = times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END
    WHERE id = NEW.question_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE quiz_results IS 'Quiz Generator: Stores completed quiz results for all game types';
COMMENT ON TABLE quiz_question_responses IS 'Quiz Generator: Individual question responses within a quiz';
COMMENT ON TABLE questions IS 'Shared question bank for all maths games (Gem Hunt, Quiz Generator, etc)';
COMMENT ON FUNCTION get_random_questions IS 'Get random questions for a year group, optionally filtered by subject and difficulty';
COMMENT ON FUNCTION get_available_subjects IS 'Get all available subjects for a specific year group';
COMMENT ON FUNCTION get_available_year_groups IS 'Get all available year groups that have active questions';
