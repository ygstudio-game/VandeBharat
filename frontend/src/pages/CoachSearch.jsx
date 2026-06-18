import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Train, ShieldAlert, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { searchCoaches } from '../lib/api';

export const CoachSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchCoaches(q.trim());
      setResults(data.coaches || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(query);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">COACH SEARCH</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search by coach number or train number to view complete inspection history.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. C3, VB-22804…"
          className="w-full pl-11 pr-28 py-3 bg-card border border-border rounded text-sm focus:outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </form>

      {searched && !loading && (
        <div className="space-y-3">
          {(!results || results.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground text-sm font-medium">
              No coaches matched "{query}".
            </div>
          ) : (
            results.map((c) => (
              <Card
                key={c.id}
                className="border border-border shadow-sm hover:border-primary transition-colors cursor-pointer"
                onClick={() => navigate(`/train/${c.session_id}`)}
              >
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0">
                      <Train className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-foreground text-sm">
                          Coach {c.coach_number}
                        </span>
                        {c.coach_type && (
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            {c.coach_type}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                        Train {c.train_number} · Session {c.session_code || c.session_id.slice(0, 8)} ·{' '}
                        {c.started_at ? new Date(c.started_at).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 text-xs font-bold shrink-0">
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-destructive">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {c.critical_defects}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase">Critical</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-warning">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {c.missing_components}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase">Missing</div>
                    </div>
                    <div className="text-center">
                      <div className={c.health_score >= 80 ? 'text-success' : c.health_score >= 50 ? 'text-warning' : 'text-destructive'}>
                        {c.health_score != null ? `${c.health_score}%` : '—'}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase">Health</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};
