/**
 * @jest-environment jsdom
 */
import {
  IMAGE_RULE, ATTACHMENT_RULE, isFileAllowed, uploadFailureText
} from '../../src/webparts/discussionFeed/services/fileRules';

const PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];
const JPEG = [0xFF, 0xD8, 0xFF, 0xE0, 0, 16];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37];   // %PDF-1.7
const EXE = [0x4D, 0x5A, 0x90, 0, 3, 0, 0, 0];                  // MZ
const ZIP = [0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0];               // PK, as .xlsx/.docx are
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0];         // GIF89a

const file = (name: string, bytes: number[]): File => new File([new Uint8Array(bytes)], name);

describe('the Attach button', () => {
  const allows = (name: string, bytes: number[]) => isFileAllowed(file(name, bytes), ATTACHMENT_RULE);

  it('takes PNG, JPEG and PDF', async () => {
    expect(await allows('a.png', PNG)).toBe(true);
    expect(await allows('a.jpg', JPEG)).toBe(true);
    expect(await allows('a.jpeg', JPEG)).toBe(true);
    expect(await allows('a.pdf', PDF)).toBe(true);
  });
  it('ignores the case of the extension', async () => {
    expect(await allows('SCAN.PDF', PDF)).toBe(true);
    expect(await allows('Photo.JPG', JPEG)).toBe(true);
  });
  it('refuses Office files and everything else by name', async () => {
    expect(await allows('report.xlsx', ZIP)).toBe(false);
    expect(await allows('notes.docx', ZIP)).toBe(false);
    expect(await allows('data.csv', [0x61, 0x2C, 0x62])).toBe(false);
    expect(await allows('setup.exe', EXE)).toBe(false);
    expect(await allows('noextension', PDF)).toBe(false);
  });
  it('refuses a program renamed to an allowed type', async () => {
    expect(await allows('invoice.pdf', EXE)).toBe(false);
    expect(await allows('photo.png', EXE)).toBe(false);
    expect(await allows('sheet.pdf', ZIP)).toBe(false);
  });
  it('goes by the last extension', async () => {
    expect(await allows('invoice.pdf.exe', PDF)).toBe(false);
    expect(await allows('setup.exe.pdf', EXE)).toBe(false);
  });
  it('refuses an empty or too-short file', async () => {
    expect(await allows('empty.pdf', [])).toBe(false);
    expect(await allows('short.pdf', [0x25, 0x50])).toBe(false);
  });
  it('lets a JPEG saved as .png through: harmless, and common', async () => {
    expect(await allows('photo.png', JPEG)).toBe(true);
  });
});

describe('the Add image button', () => {
  const allows = (name: string, bytes: number[]) => isFileAllowed(file(name, bytes), IMAGE_RULE);

  it('takes PNG and JPEG', async () => {
    expect(await allows('a.png', PNG)).toBe(true);
    expect(await allows('a.jpg', JPEG)).toBe(true);
    expect(await allows('a.jpeg', JPEG)).toBe(true);
  });
  it('refuses a PDF, which the gallery cannot show, even renamed', async () => {
    expect(await allows('a.pdf', PDF)).toBe(false);
    expect(await allows('a.png', PDF)).toBe(false);
  });
  it('refuses other image types', async () => {
    expect(await allows('a.gif', GIF)).toBe(false);
    expect(await allows('a.svg', [0x3C, 0x73, 0x76, 0x67])).toBe(false);
    expect(await allows('a.webp', [0x52, 0x49, 0x46, 0x46])).toBe(false);
    expect(await allows('a.png', GIF)).toBe(false);
  });
});

describe('uploadFailureText', () => {
  it("gives SharePoint's own words, unescaped", () => {
    const body = '{"error":{"code":"-1, Microsoft.SharePoint.SPException","message":{"lang":"en-US","value":"The file \\u0027big.pdf\\u0027 exceeds the limit."}}}';
    const e = new Error('Error making HttpClient request in queryable [400] Bad Request ::> ' + body);
    expect(uploadFailureText(e)).toBe("The file 'big.pdf' exceeds the limit.");
  });
  it('falls back to a general note when there are none', () => {
    const general = 'The upload did not complete. The file may be too large for SharePoint, or the connection was lost.';
    expect(uploadFailureText(new Error('Failed to fetch'))).toBe(general);
    expect(uploadFailureText(new Error('[413] <html>Request Entity Too Large</html>'))).toBe(general);
    expect(uploadFailureText(null)).toBe(general);
  });
});
