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
