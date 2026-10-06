import React from 'react';

// Inline parser: converts **bold**, then returns React nodes
function parseInline(text: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = boldRegex.exec(text)) !== null) {
        if (match.index > last) nodes.push(<span key={key++}>{text.slice(last, match.index)}</span>);
        nodes.push(<strong key={key++}>{match[1]}</strong>);
        last = match.index + match[0].length;
    }
    if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
    return nodes;
}

// Render a plain text segment (no code blocks) with markdown lines
function renderTextSegment(raw: string, segKey: number): React.ReactNode {
    // Normalize literal \n escape sequences to actual newlines
    const text = raw.replace(/\\n/g, '\n').replace(/\\r/g, '').trim();
    if (!text) return null;

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    // Helper: parse a pipe-table row into cells
    const parsePipeRow = (row: string): string[] =>
        row.split('|').slice(1, -1).map(c => c.trim());

    // Helper: check if a row is a markdown separator row (|---|---|)
    const isSepRow = (row: string): boolean => /^\|[-| :]+\|$/.test(row.trim());

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Markdown pipe table detection
        if (line.trim().startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            i--; // undo last increment; for-loop's i++ will advance past last table line

            const sepIdx = tableLines.findIndex(l => isSepRow(l));
            if (sepIdx >= 1) {
                const headers = parsePipeRow(tableLines[sepIdx - 1]);
                const dataRows = tableLines.slice(sepIdx + 1).filter(r => !isSepRow(r));
                elements.push(
                    <div key={`${segKey}-tbl-${key++}`} className="overflow-x-auto my-2 rounded-lg border border-slate-300 dark:border-slate-600">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-pink-50 dark:bg-pink-900/20">
                                    {headers.map((h, hi) => (
                                        <th key={hi} className="border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-left font-semibold text-slate-700 dark:text-slate-300">
                                            {parseInline(h)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {dataRows.map((row, ri) => (
                                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/40'}>
                                        {parsePipeRow(row).map((cell, ci) => (
                                            <td key={ci} className="border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-slate-700 dark:text-slate-300">
                                                {parseInline(cell)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            } else {
                // Not a proper table — render lines as monospace text
                for (const tl of tableLines) {
                    elements.push(
                        <p key={`${segKey}-p-${key++}`} className="font-mono text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(tl)}</p>
                    );
                }
            }
            continue;
        }

        // Blank line → spacing
        if (!line.trim()) {
            elements.push(<div key={`${segKey}-sp-${key++}`} className="h-2" />);
            continue;
        }

        // ### Heading 3
        if (/^###\s+/.test(line)) {
            elements.push(
                <h6 key={`${segKey}-h3-${key++}`} className="font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1 text-[13px] uppercase tracking-wide">
                    {parseInline(line.replace(/^###\s+/, ''))}
                </h6>
            );
            continue;
        }
        // ## Heading 2
        if (/^##\s+/.test(line)) {
            elements.push(
                <h5 key={`${segKey}-h2-${key++}`} className="font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1 text-sm uppercase tracking-wide">
                    {parseInline(line.replace(/^##\s+/, ''))}
                </h5>
            );
            continue;
        }
        // # Heading 1
        if (/^#\s+/.test(line)) {
            elements.push(
                <h4 key={`${segKey}-h1-${key++}`} className="font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1 text-base">
                    {parseInline(line.replace(/^#\s+/, ''))}
                </h4>
            );
            continue;
        }

        // Bullet list item (-, *, •)
        if (/^[-*•]\s+/.test(line)) {
            elements.push(
                <div key={`${segKey}-li-${key++}`} className="flex items-start gap-2 my-0.5 ml-2">
                    <span className="flex-shrink-0 mt-[6px] w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                    <span className="text-slate-800 dark:text-slate-300 leading-relaxed">
                        {parseInline(line.replace(/^[-*•]\s+/, ''))}
                    </span>
                </div>
            );
            continue;
        }

        // Numbered list item (1. 2. etc.)
        const numMatch = /^(\d+)\.\s+(.*)$/.exec(line);
        if (numMatch) {
            elements.push(
                <div key={`${segKey}-nl-${key++}`} className="flex items-start gap-2 my-0.5 ml-2">
                    <span className="flex-shrink-0 font-semibold text-slate-500 dark:text-slate-400 text-xs min-w-[18px] text-right mt-[2px]">{numMatch[1]}.</span>
                    <span className="text-slate-800 dark:text-slate-300 leading-relaxed">
                        {parseInline(numMatch[2])}
                    </span>
                </div>
            );
            continue;
        }

        // Regular paragraph line
        elements.push(
            <p key={`${segKey}-p-${key++}`} className="text-slate-800 dark:text-slate-300 leading-relaxed text-justify">
                {parseInline(line)}
            </p>
        );
    }

    return <div key={segKey}>{elements}</div>;
}

export default function FormattedAnswer({ answer }: { answer: string }) {
    // Normalize literal \n at the top level before splitting code blocks
    const normalized = answer.replace(/\\n/g, '\n').replace(/\\r/g, '');

    // Split on fenced code blocks: ```lang\n...\n```
    const segments = normalized.split(/(```[\s\S]*?```)/g);

    return (
        <div className="mt-3 bg-blue-50 dark:bg-slate-950 rounded-lg text-sm border border-blue-100 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-blue-100 dark:border-slate-800 bg-blue-100/50 dark:bg-slate-900">
                <span className="font-bold text-blue-700 dark:text-blue-300">Answer:</span>
            </div>
            <div className="p-3 space-y-1">
                {segments.map((seg, idx) => {
                    if (/^```/.test(seg)) {
                        // Extract optional language label from first line
                        const inner = seg.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
                        const langMatch = /^```([a-zA-Z0-9_+-]*)/.exec(seg);
                        const lang = langMatch?.[1]?.trim() || '';
                        return (
                            <div key={idx} className="my-2">
                                {lang && (
                                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-t-md border-b border-slate-700">
                                        <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">{lang}</span>
                                    </div>
                                )}
                                <pre className={`p-3 bg-slate-950 text-slate-100 ${lang ? 'rounded-b-md' : 'rounded-md'} overflow-x-auto font-mono text-xs leading-relaxed shadow-inner border border-slate-800`}>
                                    <code>{inner.trim()}</code>
                                </pre>
                            </div>
                        );
                    }
                    return renderTextSegment(seg, idx);
                })}
            </div>
        </div>
    );
}
