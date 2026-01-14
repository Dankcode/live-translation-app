# Project Context

## Tech Stack
- Frontend: Next.js 15 (App Router)
- Database: Supabase (PostgreSQL)
- Auth: Clerk

## Architecture
- `/components`: Reusable UI elements.
- `/lib`: Utility functions and database clients.
- `/hooks`: Custom React hooks for data fetching.

## Core Goal
Building a translation app for meeting presenters that overlays subtitles over a presentation. The electron app will include a language setting on which language to translate it to. The app will usee gemini language recongition and convert the audio into text as well as translate it.  