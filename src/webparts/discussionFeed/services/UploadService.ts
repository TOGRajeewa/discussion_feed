import { sp } from '@pnp/sp';

/**
 * Upload an image (paste/file-pick from the editor) to the LOCAL asset library
 * and return its server-relative URL to embed in the post HTML.
 * No OneDrive, no cloud storage — straight to a farm document library.
 */
export async function uploadFeedImage(
  assetLibraryServerRelUrl: string,
  file: File
): Promise<string> {
  const safeName: string =
    `${new Date().getTime()}_${file.name.replace(/[^\w.\-]/g, '_')}`;

  const folder = sp.web.getFolderByServerRelativeUrl(assetLibraryServerRelUrl);

  // Small files: .add. Large (>~10MB) on slow on-prem links: prefer .addChunked.
  if (file.size <= 10 * 1024 * 1024) {
    const result = await folder.files.add(safeName, file, true);
    return result.data.ServerRelativeUrl;
  }
  const chunked = await folder.files.addChunked(safeName, file, () => { /* progress */ }, true);
  return chunked.data.ServerRelativeUrl;
}
