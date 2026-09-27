-- Game Sessions Database Schema
-- PostgreSQL / Neon Database
-- Migration: 011_game_sessions.sql
--
-- This migration creates the game_sessions table for storing game session data
-- from all games (Maths Quiz, Gem Hunt, Word Search, etc.)
-- References existing 'students' table from bft-api

-- Enable UUID extension (may already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL CHECK (game_type IN ('maths-quiz', 'gem-hunt', 'word-search')),
    score INTEGER NOT NULL CHECK (score >= 0),
    max_score INTEGER NOT NULL CHECK (max_score > 0),
    score_percentage DECIMAL(5, 2) GENERATED ALWAYS AS ((score::decimal / max_score::decimal) * 100) STORED,
    time_elapsed_seconds INTEGER CHECK (time_elapsed_seconds >= 0),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    game_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_score CHECK (score <= max_score),
    CONSTRAINT valid_timestamps CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_type ON game_sessions(game_type);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_type ON game_sessions(user_id, game_type);
CREATE INDEX IF NOT EXISTS idx_game_sessions_completed_at ON game_sessions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_data ON game_sessions USING gin(game_data);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_game_sessions_updated_at
    BEFORE UPDATE ON game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE game_sessions IS 'Stores game session data for all games (Maths Quiz, Gem Hunt, Word Search, etc.)';
COMMENT ON COLUMN game_sessions.game_type IS 'Type of game: maths-quiz, gem-hunt, word-search';
COMMENT ON COLUMN game_sessions.score_percentage IS 'Automatically calculated percentage score';
COMMENT ON COLUMN game_sessions.game_data IS 'Flexible JSON object for game-specific data (questions, answers, etc.)';
