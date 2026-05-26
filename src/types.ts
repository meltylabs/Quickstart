export interface GenerationResult {
  imageDataUrl: string;
  shareId: string;
  itemName: string;
}

export type UploadStep = 'person' | 'garment' | 'generating' | 'result';
export type AppStep = 'intro' | 'person' | 'garment' | 'generating' | 'result';

export interface VoteData {
  cop: number;
  drop: number;
  imageDataUrl: string;
  itemName: string;
}
