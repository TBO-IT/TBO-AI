export interface Dataset {
  id: string;
  filename: string;
  status: string;
  rowCount: number | null;
  uploadedAt: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  } | null;
}
