/**
 * What kind of thing an attachment is, judged from its URL.
 *
 * This lived as three copies of the same regex in the run screen — thumbnail,
 * evidence strip and lightbox — and none of them listed `.mov`. Every screen
 * recording made on a Mac is a `.mov`, so each one uploaded fine and then
 * rendered as a broken image in all three places.
 */

const VIDEO = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv)$/i;
const DOCUMENT = /\.(zip|pdf|csv|txt|log|json|har|doc|docx|xls|xlsx)$/i;

export function isVideoUrl(url?: string): boolean {
  return Boolean(url && VIDEO.test(url));
}

export function isDocumentUrl(url?: string): boolean {
  return Boolean(url && DOCUMENT.test(url));
}
