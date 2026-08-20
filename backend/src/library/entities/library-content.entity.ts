import { FirestoreEntity } from '../../core/firebase/firestore.repository';

export enum LibraryContentStatus {
  Discovered = 'discovered',
  Pending = 'pending',
  Inprogress = 'inprogress',
  Completed = 'completed',
  Failed = 'failed',
}

export enum LibraryContentType {
  Original = 'original',
  Translation = 'translation',
  Audio = 'audio',
  Image = 'image',
  Video = 'video',
}

export enum ContentLanguages {
  Vietnamese = 'vi',
  English = 'en',
  Chinese = 'zh',
}

/** A piece of content, whatever its type. The base shape is the same for every type */
export interface LibraryContentBase extends FirestoreEntity {
  id: string;
  idx: number;
  type: LibraryContentType;
  status: LibraryContentStatus;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One chapter of a novel. */
export interface TextContent extends LibraryContentBase {
  contentUrl: string | null;
  language: ContentLanguages;
  title: string;
  words: number;
}

/** One audio file of a set. */
export interface AudioContent extends LibraryContentBase {
  contentUrl: string | null;
  language: ContentLanguages;
  subtitleUrl: string | null;
}

/** One image of a set. */
export interface ImageContent extends LibraryContentBase {
  contentUrl: string | null;
  filename: string;
  filesize: number;
  dimensions: string;
}

/** One clip of a set. */
export interface VideoContent extends LibraryContentBase {
  contentUrl: string | null;
  filename: string;
  filesize: number;
  dimensions: string;
  duration: number;
}