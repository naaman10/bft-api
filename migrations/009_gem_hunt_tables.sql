-- Gem Hunt Database Schema
-- PostgreSQL / Neon Database
-- Migration: 009_gem_hunt_tables.sql
--
-- IMPORTANT: This schema integrates with existing BFT system
-- All tables prefixed with gem_hunt_ to avoid conflicts
-- References existing 'students' table from bft-api
--
-- DO NOT modify existing tables: students, enrollments, points

-- Enable UUID extension (may already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clean up misnamed tables from a previous failed apply of this migration
DROP TABLE IF EXISTS question_responses CASCADE;
DROP TABLE IF EXISTS question_bank CASCADE;

-- Game sessions table
CREATE TABLE IF NOT EXISTS gem_hunt_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    year_group VARCHAR(50) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    current_level INT DEFAULT 1,
    total_gems INT DEFAULT 0,
    lives_remaining INT DEFAULT 5,
    moves_remaining INT DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_gem_hunt_sessions_student ON gem_hunt_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_sessions_active ON gem_hunt_sessions(student_id, completed) WHERE completed = FALSE;
CREATE INDEX IF NOT EXISTS idx_gem_hunt_sessions_year_subject ON gem_hunt_sessions(year_group, subject);

-- Level progress table
CREATE TABLE IF NOT EXISTS gem_hunt_level_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_id UUID REFERENCES gem_hunt_sessions(id) ON DELETE SET NULL,
    year_group VARCHAR(50) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    level_number INT NOT NULL,
    gems_collected INT DEFAULT 0,
    moves_used INT DEFAULT 0,
    questions_answered INT DEFAULT 0,
    questions_correct INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    time_taken_seconds INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, year_group, subject, level_number, session_id)
);

CREATE INDEX IF NOT EXISTS idx_gem_hunt_progress_student ON gem_hunt_level_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_progress_year_subject ON gem_hunt_level_progress(student_id, year_group, subject);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_progress_completed ON gem_hunt_level_progress(completed, completed_at);

-- Leaderboard table
CREATE TABLE IF NOT EXISTS gem_hunt_leaderboard (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    year_group VARCHAR(50) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    total_gems INT DEFAULT 0,
    highest_level INT DEFAULT 1,
    total_games_played INT DEFAULT 0,
    total_time_played_seconds INT DEFAULT 0,
    average_accuracy DECIMAL(5, 2) DEFAULT 0.0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, year_group, subject)
);

CREATE INDEX IF NOT EXISTS idx_gem_hunt_leaderboard_ranking ON gem_hunt_leaderboard(year_group, subject, total_gems DESC);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_leaderboard_student ON gem_hunt_leaderboard(student_id);

-- Question bank table (must exist before responses FK)
CREATE TABLE IF NOT EXISTS gem_hunt_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year_group VARCHAR(50) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    question_text TEXT NOT NULL,
    correct_answer VARCHAR(255) NOT NULL,
    alternative_answers TEXT[],
    hint TEXT,
    explanation TEXT,
    difficulty_level INT DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 3),
    times_asked INT DEFAULT 0,
    times_correct INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_gem_hunt_questions_year_subject ON gem_hunt_questions(year_group, subject, active);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_questions_difficulty ON gem_hunt_questions(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_questions_active ON gem_hunt_questions(active) WHERE active = TRUE;

-- Question responses table
CREATE TABLE IF NOT EXISTS gem_hunt_question_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES gem_hunt_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES gem_hunt_questions(id) ON DELETE CASCADE,
    user_answer VARCHAR(255),
    is_correct BOOLEAN NOT NULL,
    time_taken_seconds INT,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gem_hunt_responses_session ON gem_hunt_question_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_responses_question ON gem_hunt_question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_gem_hunt_responses_correctness ON gem_hunt_question_responses(is_correct);

-- Achievements table (optional for future)
CREATE TABLE IF NOT EXISTS gem_hunt_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon_url VARCHAR(500),
    requirement_type VARCHAR(50) NOT NULL,
    requirement_value INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student achievements table
CREATE TABLE IF NOT EXISTS gem_hunt_student_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES gem_hunt_achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_gem_hunt_student_achievements ON gem_hunt_student_achievements(student_id);

-- Functions and Triggers

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gem_hunt_questions_updated_at ON gem_hunt_questions;
CREATE TRIGGER update_gem_hunt_questions_updated_at
    BEFORE UPDATE ON gem_hunt_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_gem_hunt_leaderboard_entry(
    p_student_id UUID,
    p_year_group VARCHAR,
    p_subject VARCHAR,
    p_gems INT,
    p_level INT,
    p_time_seconds INT,
    p_accuracy DECIMAL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO gem_hunt_leaderboard (
        student_id,
        year_group,
        subject,
        total_gems,
        highest_level,
        total_games_played,
        total_time_played_seconds,
        average_accuracy,
        last_updated
    )
    VALUES (
        p_student_id,
        p_year_group,
        p_subject,
        p_gems,
        p_level,
        1,
        p_time_seconds,
        p_accuracy,
        NOW()
    )
    ON CONFLICT (student_id, year_group, subject)
    DO UPDATE SET
        total_gems = gem_hunt_leaderboard.total_gems + p_gems,
        highest_level = GREATEST(gem_hunt_leaderboard.highest_level, p_level),
        total_games_played = gem_hunt_leaderboard.total_games_played + 1,
        total_time_played_seconds = gem_hunt_leaderboard.total_time_played_seconds + p_time_seconds,
        average_accuracy = (gem_hunt_leaderboard.average_accuracy * gem_hunt_leaderboard.total_games_played + p_accuracy) / (gem_hunt_leaderboard.total_games_played + 1),
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

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
    RETURN QUERY
    SELECT
        qb.id,
        qb.question_text,
        qb.year_group,
        qb.subject,
        qb.difficulty_level
    FROM gem_hunt_questions qb
    WHERE qb.year_group = p_year_group
        AND qb.subject = p_subject
        AND qb.active = TRUE
        AND (p_difficulty IS NULL OR qb.difficulty_level = p_difficulty)
    ORDER BY RANDOM()
    LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_gem_hunt_question_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE gem_hunt_questions
    SET
        times_asked = times_asked + 1,
        times_correct = times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END
    WHERE id = NEW.question_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gem_hunt_question_statistics ON gem_hunt_question_responses;
CREATE TRIGGER update_gem_hunt_question_statistics
    AFTER INSERT ON gem_hunt_question_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_gem_hunt_question_stats();

-- Views

CREATE OR REPLACE VIEW gem_hunt_leaderboard_with_students AS
SELECT
    l.id,
    l.student_id,
    s.name as student_name,
    s.email,
    l.year_group,
    l.subject,
    l.total_gems,
    l.highest_level,
    l.total_games_played,
    l.total_time_played_seconds,
    l.average_accuracy,
    l.last_updated,
    RANK() OVER (PARTITION BY l.year_group, l.subject ORDER BY l.total_gems DESC) as rank
FROM gem_hunt_leaderboard l
JOIN students s ON l.student_id = s.id;

CREATE OR REPLACE VIEW gem_hunt_student_progress_summary AS
SELECT
    s.id as student_id,
    s.name as student_name,
    lp.year_group,
    lp.subject,
    COUNT(DISTINCT lp.level_number) as levels_completed,
    MAX(lp.level_number) as highest_level,
    SUM(lp.gems_collected) as total_gems,
    SUM(lp.questions_answered) as total_questions,
    SUM(lp.questions_correct) as total_correct,
    ROUND(
        CASE
            WHEN SUM(lp.questions_answered) > 0
            THEN (SUM(lp.questions_correct)::DECIMAL / SUM(lp.questions_answered) * 100)
            ELSE 0
        END,
        2
    ) as accuracy_percentage
FROM students s
LEFT JOIN gem_hunt_level_progress lp ON s.id = lp.student_id AND lp.completed = TRUE
GROUP BY s.id, s.name, lp.year_group, lp.subject;

-- Sample questions for Year 6 Percentages
INSERT INTO gem_hunt_questions (year_group, subject, question_text, correct_answer, difficulty_level)
SELECT v.year_group, v.subject, v.question_text, v.correct_answer, v.difficulty_level
FROM (
    VALUES
        ('Year 6', 'Percentages', 'What is 25% of 80?', '20', 1),
        ('Year 6', 'Percentages', 'What is 50% of 120?', '60', 1),
        ('Year 6', 'Percentages', 'What is 10% of 200?', '20', 1),
        ('Year 6', 'Percentages', 'What is 75% of 40?', '30', 2),
        ('Year 6', 'Percentages', 'What is 20% of 150?', '30', 1),
        ('Year 6', 'Percentages', 'What is 30% of 100?', '30', 1),
        ('Year 6', 'Percentages', 'What is 15% of 80?', '12', 2),
        ('Year 6', 'Percentages', 'What is 60% of 50?', '30', 2),
        ('Year 6', 'Percentages', 'What is 5% of 200?', '10', 1),
        ('Year 6', 'Percentages', 'What is 40% of 75?', '30', 2)
) AS v(year_group, subject, question_text, correct_answer, difficulty_level)
WHERE NOT EXISTS (
    SELECT 1
    FROM gem_hunt_questions q
    WHERE q.year_group = v.year_group
      AND q.subject = v.subject
      AND q.question_text = v.question_text
);

COMMENT ON TABLE gem_hunt_sessions IS 'Gem Hunt: Tracks individual game sessions with progress';
COMMENT ON TABLE gem_hunt_level_progress IS 'Gem Hunt: Records student progress for each level';
COMMENT ON TABLE gem_hunt_leaderboard IS 'Gem Hunt: Aggregated leaderboard rankings by year/subject';
COMMENT ON TABLE gem_hunt_questions IS 'Gem Hunt: Repository of all math questions for the game';
COMMENT ON TABLE gem_hunt_question_responses IS 'Gem Hunt: Individual question answer records';
COMMENT ON TABLE gem_hunt_achievements IS 'Gem Hunt: Available achievements in the game';
COMMENT ON TABLE gem_hunt_student_achievements IS 'Gem Hunt: Achievements unlocked by students';
