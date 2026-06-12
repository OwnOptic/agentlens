'use client';

/**
 * Ask (AI) page
 *
 * Natural-language query interface over the read-only AgentLens schema.
 * Submits to POST /api/ask and renders the result as a table.
 */

import React, { useState, useRef } from 'react';
import type { NlQueryResult } from '@/lib/ai/nlQuery';
import { ALLOWLISTED_SCHEMA } from '@/lib/ai/nlQuery';

// ---------------------------------------------------------------------------
// Suggested questions
// ---------------------------------------------------------------------------
const SUGGESTIONS = [
  'Show all agents in production',
  'Which environments are in credit overage?',
  'Show all agents with no owner',
  'List open critical alerts',
  'Show all open compliance violations',
  'Show all PoC agents',
  'List all environments',
];

// ---------------------------------------------------------------------------
// ResultTable
// ---------------------------------------------------------------------------
function ResultTable({ result }: { result: NlQueryResult }) {
  if (result.error) {
    return (
      <div className="rounded-md border border-red-800 bg-red-950/40 p-4 text-sm text-red-400">
        {result.error}
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        Query returned 0 rows.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800 text-left">
            {result.columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 font-medium text-slate-300 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors"
            >
              {result.columns.map((col) => {
                const val = row[col];
                const display =
                  val === null || val === undefined
                    ? ''
                    : typeof val === 'object'
                    ? JSON.stringify(val)
                    : String(val);
                return (
                  <td key={col} className="px-3 py-2 text-slate-300 whitespace-nowrap">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NlQueryResult | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent | null, overrideQuestion?: string) {
    if (e) e.preventDefault();
    const q = (overrideQuestion ?? question).trim();
    if (!q) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as NlQueryResult;
      setResult(data);
    } catch {
      setResult({
        sql: '',
        columns: [],
        rows: [],
        isMock: true,
        error: 'Network error - could not reach /api/ask',
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestion(s: string) {
    setQuestion(s);
    void handleSubmit(null, s);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Ask (AI)</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ask a question in plain English. The engine translates it to read-only SQL
          over the AgentLens schema and returns the matching data.
        </p>
      </div>

      {/* Schema toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowSchema((v) => !v)}
          className="text-xs text-emerald-400 hover:text-emerald-300 underline"
        >
          {showSchema ? 'Hide schema' : 'Show allowlisted schema'}
        </button>
        {showSchema && (
          <pre className="mt-2 overflow-x-auto rounded-md border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">
            {ALLOWLISTED_SCHEMA}
          </pre>
        )}
      </div>

      {/* Query form */}
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Which environments are in credit overage?"
          rows={3}
          className="w-full resize-none rounded-md border border-slate-700 bg-slate-900
                     px-4 py-3 text-sm text-slate-200 placeholder-slate-600
                     focus:outline-none focus:ring-2 focus:ring-emerald-600"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              void handleSubmit(null);
            }
          }}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium
                       text-white transition-colors hover:bg-emerald-600
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run query'}
          </button>
          <span className="text-xs text-slate-600">or Cmd+Enter</span>
        </div>
      </form>

      {/* Suggestions */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-600">
          Suggested questions
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestion(s)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1
                         text-xs text-slate-400 transition-colors hover:border-emerald-700
                         hover:text-emerald-400"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {result !== null && (
        <div className="space-y-4">
          {/* Generated SQL */}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-600">
              Generated SQL
            </p>
            <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-900
                            p-3 text-xs text-slate-300">
              {result.sql || '(none)'}
            </pre>
            {result.isMock && (
              <p className="mt-1 text-xs text-slate-600">
                Running against mock seed data (offline mode).
              </p>
            )}
          </div>

          {/* Row count badge */}
          {!result.error && (
            <p className="text-xs text-slate-500">
              {result.rows.length} row(s) returned
            </p>
          )}

          {/* Table */}
          <ResultTable result={result} />
        </div>
      )}
    </div>
  );
}
