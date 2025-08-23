interface ProcessResponse {
    error?: string;
    rewritten_sentences?: Array<{
        original_text: string;
        rewritten_text: string;
        original_index: number;
    }>;
}

export type {ProcessResponse};