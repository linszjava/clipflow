export interface Clip {
    id: string;
    type: 'text' | 'image' | 'file';
    content: string;
    page_id: string | null;
    title?: string;
    is_pinned: boolean;
    created_at: string;
}

export interface Page {
    id: string;
    name: string;
    rank: number;
    is_system: boolean;
}

export interface SnippetPage {
    id: string;
    name: string;
    rank: number;
    created_at: string;
    headers?: string;
    password?: string;
}

export interface SnippetItem {
    id: string;
    page_id: string;
    data: string; // JSON string of string[]
    rank: number;
    created_at: string;
}

export interface AnalysisMetricRow {
    value: string;
    totalCopies: number;
    copiesLast7Days: number;
    avgCopiesPerDay7Days: number;
    lastCopiedAt: string;
}

export interface AnalysisDailyPoint {
    date: string;
    copies: number;
}

export interface AnalysisHourlyPoint {
    hour: number;
    copies: number;
}

export interface AnalysisPage {
    id: string;
    sourcePageId: string;
    sourcePageName?: string;
    name: string;
    generatedAt: string;
    rows: AnalysisMetricRow[];
    dailyTrend14d: AnalysisDailyPoint[];
    hourlyDistribution: AnalysisHourlyPoint[];
}
