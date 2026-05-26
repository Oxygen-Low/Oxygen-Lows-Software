/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export interface LocalFile {
  name: string;
  size: number;
  type: string;
  createdAt: string;
  url: string;
}

export interface LocalFilesResponse {
  files: LocalFile[];
}

export interface UploadResponse {
  message: string;
  file?: LocalFile;
}
