const ROOT = 'facturation';
const PDF_DIR = 'pdfs';
const HEADER_FILE = 'header.png';

const opfsAvailable = (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory);

function opfsGuard() {
  if (!opfsAvailable) throw new Error('OPFS not available');
}

async function getDir(handle, name) {
  return handle.getDirectoryHandle(name, { create: true });
}

async function rootDir() {
  return getDir(await navigator.storage.getDirectory(), ROOT);
}

async function pdfDir() {
  return getDir(await rootDir(), PDF_DIR);
}

/* ---------- Header image ---------- */

export async function migrateHeaderFromCompany(company) {
  if (!company.headerImage) return false;
  try {
    const resp = await fetch(company.headerImage);
    const blob = await resp.blob();
    await saveHeaderImage(blob);
    return true;
  } catch (_) { return false; }
}

export async function saveHeaderImage(blob) {
  const dir = await rootDir();
  const fh = await dir.getFileHandle(HEADER_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function loadHeaderImage() {
  try {
    const dir = await rootDir();
    return await (await (await dir.getFileHandle(HEADER_FILE)).getFile());
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

export async function deleteHeaderImage() {
  try { await (await rootDir()).removeEntry(HEADER_FILE); }
  catch (e) { if (e.name !== 'NotFoundError') throw e; }
}

/* ---------- PDF files ---------- */

export async function savePdfFile(filename, blob) {
  const dir = await pdfDir();
  const fh = await dir.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function loadPdfFile(filename) {
  try {
    const dir = await pdfDir();
    return await (await (await dir.getFileHandle(filename)).getFile());
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

export async function deletePdfFile(filename) {
  try { await (await pdfDir()).removeEntry(filename); }
  catch (e) { if (e.name !== 'NotFoundError') throw e; }
}
